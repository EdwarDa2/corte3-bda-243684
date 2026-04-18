const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const redis = require('redis');
require('dotenv').config();


const app = express();
const port = process.env.PORT || 3000;

app.use(cors()); 
app.use(express.json());
app.use((req, res, next) => {
    res.on('finish', () => {
        console.log(`[API] ${req.method} ${req.url} -> Estado: ${res.statusCode}`);
    });
    next();
});

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 
        `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`
});

pool.on('error', (err) => {
    console.error('Error inesperado en el pool de PostgreSQL:', err);
});


const redisClient = redis.createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => console.error('Error en el cliente de Redis:', err));

(async () => {
    try {
        await redisClient.connect();
        console.log('Conectado exitosamente a Redis');
    } catch (err) {
        console.error('No se pudo conectar a Redis', err);
    }
})();

app.get('/api/health', async (req, res) => {
    try {
        
        const dbResult = await pool.query('SELECT NOW() as tiempo_actual');
        
        await redisClient.set('ping', 'pong', { EX: 10 }); 
        const cacheResult = await redisClient.get('ping');

        res.json({
            estado: 'El servidor está vivo',
            base_de_datos: 'Conectada',
            hora_servidor: dbResult.rows[0].tiempo_actual,
            redis: cacheResult === 'pong' ? 'Conectado' : 'Fallo'
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Fallo en las conexiones internas' });
    }
});

// ==============================================================================
// 1. ENDPOINT: Búsqueda de Mascotas (Defensa contra SQL Injection)
// ==============================================================================

app.get('/api/mascotas/buscar', async (req, res) => {
    const { nombre } = req.query;
    console.log(`Petición de búsqueda recibida: "${nombre}"`);

    if (!nombre) {
        return res.status(400).json({ error: 'El parámetro nombre es requerido' });
    }

    try {
        const query = `
            SELECT m.id, m.nombre, m.especie, d.nombre as dueno
            FROM mascotas m
            JOIN duenos d ON m.dueno_id = d.id
            WHERE m.nombre ILIKE $1
        `;
        const values = [`%${nombre}%`];
        const result = await pool.query(query, values);

        if (result.rows.length === 0) {
            return res.status(404).json({ mensaje: 'No se encontraron mascotas con ese criterio' });
        }

        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error en búsqueda:', error);
        res.status(500).json({ error: 'Error interno del servidor al buscar mascotas' });
    }
});

// ==============================================================================
// 2. ENDPOINT: Vacunaciones Pendientes (Implementación de Redis Cache)
// ==============================================================================

app.get('/api/reportes/vacunacion-pendiente', async (req, res) => {
    const CACHE_KEY = 'reporte:vacunaciones_pendientes';

    try {
        const cachedData = await redisClient.get(CACHE_KEY);
        
        if (cachedData) {
            console.log('Sirviendo desde Redis Cache');
            return res.status(200).json(JSON.parse(cachedData));
        }

        console.log('Sirviendo desde PostgreSQL');
        const query = `SELECT * FROM v_mascotas_vacunacion_pendiente`;
        const result = await pool.query(query);

        await redisClient.set(CACHE_KEY, JSON.stringify(result.rows), { EX: 60 });

        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error en el reporte:', error);
        res.status(500).json({ error: 'Error interno al generar el reporte' });
    }
});

// ==============================================================================
// 3. MIDDLEWARE: Autenticación y Contexto RLS (Protección de Connection Pool)
// ==============================================================================

const rlsMiddleware = async (req, res, next) => {
    const rol = req.headers['x-rol']; 
    const vetId = req.headers['x-vet-id'];

    if (!rol) {
        return res.status(401).json({ error: 'Acceso denegado. Se requiere autenticación (Rol).' });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        await client.query(`SET LOCAL ROLE ${rol}`);
        
        if (rol === 'rol_veterinario' && vetId) {
            await client.query(`SET LOCAL app.current_vet_id = ${vetId}`);
        }

        req.dbClient = client;
        next(); 
    } catch (error) {
        await client.query('ROLLBACK');
        client.release();
        console.error('Error de seguridad RLS:', error);
        res.status(403).json({ error: 'Rol inválido o permisos insuficientes' });
    }
};

// ==============================================================================
// 4. ENDPOINT: Ver Citas (Demostración de RLS en acción)
// ==============================================================================
// Pasamos 'rlsMiddleware' antes de ejecutar la lógica de la ruta

app.get('/api/citas', rlsMiddleware, async (req, res) => {
    try {
        const result = await req.dbClient.query('SELECT * FROM citas');
        await req.dbClient.query('COMMIT');
        
        res.status(200).json(result.rows);
    } catch (error) {
        await req.dbClient.query('ROLLBACK');
        console.error('Error al obtener citas:', error);
        res.status(500).json({ error: 'Error al consultar las citas' });
    } finally {
        req.dbClient.release(); 
    }
});

app.listen(port, () => {
    console.log(`API corriendo en http://localhost:${port}`);
});
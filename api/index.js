const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const redis = require('redis');
require('dotenv').config();


const app = express();
const port = process.env.PORT || 3000;

app.use(cors()); 
app.use(express.json());

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`
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
        
        // Prueba de Caché
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
        
        // El input del usuario se envía encapsulado en un arreglo independiente
        const values = [`%${nombre}%`];
        
        const result = await pool.query(query, values);
        res.json(result.rows);
    } catch (error) {
        console.error('Error en búsqueda:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ==============================================================================
// 2. ENDPOINT: Vacunaciones Pendientes (Implementación de Redis Cache)
// ==============================================================================

app.get('/api/reportes/vacunacion-pendiente', async (req, res) => {
    const CACHE_KEY = 'reporte:vacunaciones_pendientes';

    try {
        // 1. Estrategia Cache-Aside: Revisar Redis primero
        const cachedData = await redisClient.get(CACHE_KEY);
        
        if (cachedData) {
            console.log('Sirviendo desde Redis Cache');
            // Si existe, lo devolvemos inmediatamente ahorrando el viaje a PostgreSQL
            return res.json(JSON.parse(cachedData));
        }

        // 2. Si no está en caché, hacemos el query pesado a PostgreSQL (usando la vista)
        console.log('Sirviendo desde PostgreSQL');
        const query = `SELECT * FROM v_mascotas_vacunacion_pendiente`;
        const result = await pool.query(query);

        // 3. Guardar el resultado en Redis para las futuras peticiones
        // Establecemos un TTL (Time To Live) de 60 segundos
        await redisClient.set(CACHE_KEY, JSON.stringify(result.rows), {
            EX: 60 
        });

        res.json(result.rows);
    } catch (error) {
        console.error('Error en el reporte de vacunación:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ==============================================================================
// 3. MIDDLEWARE: Autenticación y Contexto RLS (Protección de Connection Pool)
// ==============================================================================

const rlsMiddleware = async (req, res, next) => {
    // En un sistema real esto vendría de desencriptar un JWT. 
    // Para la evaluación, lo leeremos de los headers HTTP.
    const rol = req.headers['x-rol'] || 'rol_recepcion'; // Default
    const vetId = req.headers['x-vet-id']; 

    // 1. Tomamos una conexión exclusiva del Pool
    const client = await pool.connect();

    try {
        // 2. INICIO DE TRANSACCIÓN ESTRÍCTA (Previene fugas a otros usuarios)
        await client.query('BEGIN');

        // 3. Cambiamos la identidad de la base de datos al rol solicitado
        await client.query(`SET LOCAL ROLE ${rol}`);

        // 4. Si es un veterinario, inyectamos su ID en la variable de sesión
        if (rol === 'rol_veterinario' && vetId) {
            await client.query(`SET LOCAL app.current_vet_id = ${vetId}`);
        }

        // Guardamos el cliente configurado en la request para que el endpoint lo use
        req.dbClient = client;
        next(); 
    } catch (error) {
        await client.query('ROLLBACK');
        client.release();
        res.status(500).json({ error: 'Error configurando la seguridad RLS' });
    }
};

// ==============================================================================
// 4. ENDPOINT: Ver Citas (Demostración de RLS en acción)
// ==============================================================================
// Pasamos 'rlsMiddleware' antes de ejecutar la lógica de la ruta

app.get('/api/citas', rlsMiddleware, async (req, res) => {
    try {
       
        const result = await req.dbClient.query('SELECT * FROM citas');
        
        // Si la consulta fue exitosa, cerramos la transacción
        await req.dbClient.query('COMMIT');
        res.json(result.rows);
    } catch (error) {
        // Si algo falla, deshacemos todo
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
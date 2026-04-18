# 🐾 Sistema Full-Stack Clínica Veterinaria
**Evaluación Corte 3 - Base de Datos Avanzadas**

Este proyecto es una aplicación Full-Stack desarrollada para la gestión segura de una clínica veterinaria. Implementa una arquitectura de microservicios contenerizada con un enfoque riguroso en el **Hardening de bases de datos**, **Seguridad a Nivel de Fila (RLS)** y optimización con **Caché Distribuido**.

---

## 🚀 Instrucciones de Despliegue

**1. Clonar el repositorio:**
Descarga o clona este repositorio en tu computadora.

**2. Configurar Variables de Entorno (.env):**
Crea un archivo llamado exactamente `.env` en la **raíz del proyecto** (al mismo nivel que el archivo `docker-compose.yml`). Es indispensable configurarlo con las credenciales de tu base de datos de PostgreSQL, el puerto de tu API y la URL de Redis para que los contenedores se levanten y se comuniquen correctamente.

**3. Levantar los contenedores:**
Abre tu terminal en la carpeta raíz del proyecto y ejecuta:
```bash
docker-compose up --build -d
```

**4. Acceder al sistema:**
Una vez que la terminal indique que los contenedores están listos, accede a los servicios a través de tu navegador:

Frontend (Dashboard UI): `http://localhost:3001`

Backend API (Health Check): `http://localhost:3000/api/health`

Para detener el servidor de forma segura sin perder la persistencia de datos
```bash
docker-compose stop
```
# **Decisiones de Diseño**

### 1. ¿Qué política RLS aplicaste a la tabla mascotas? Pega la cláusula exacta y explica con tus palabras qué hace.

Cláusula SQL:
```sql
CREATE POLICY rls_vet_mascotas ON mascotas FOR ALL TO rol_veterinario
USING (
    EXISTS (
        SELECT 1 
        FROM vet_atiende_mascota vam 
        WHERE vam.mascota_id = mascotas.id 
          AND vam.vet_id = current_setting('app.current_vet_id', true)::int
    )
);
```
Explicacion:Esta política intercepta cualquier operación que haga un veterinario sobre la tabla mascotas. Para cada fila, verifica en la tabla puente vet_atiende_mascota si existe un registro que enlace esa mascota (vam.mascota_id = mascotas.id) con el ID del veterinario activo en la sesión (vam.vet_id = current_setting('app.current_vet_id', true)::int). Si no existe ese enlace, la fila se oculta automáticamente. El true como segundo argumento de current_setting evita que PostgreSQL lance un error si la variable no está definida — en ese caso devuelve NULL y la condición falla de forma segura, ocultando todas las filas.

### 2. Cualquiera que sea la estrategia que elegiste para identificar al veterinario actual en RLS, tiene un vector de ataque posible. ¿Cuál es? ¿Tu sistema lo previene? ¿Cómo?

Vector de Ataque: La fuga de datos por reutilización de conexiones en el Connection Pool de Node.js. Si inyectamos la identidad de un veterinario y la conexión se recicla para el cliente de recepción, este último heredaría los permisos del veterinario anterior.

Prevención: Sí, el sistema lo previene utilizando un bloque de transacción estricto:
```sql
BEGIN;
  SET LOCAL ROLE rol_veterinario;
  SET LOCAL app.current_vet_id = 1;
  -- Consultas...
COMMIT;
```
La instrucción LOCAL asegura que las variables de sesión se destruyan automáticamente cuando la transacción finaliza, devolviendo una conexión completamente limpia al Pool.

### 3. Si usas SECURITY DEFINER en algún procedure, ¿qué medida específica tomaste para prevenir la escalada de privilegios que ese modo habilita? Si no lo usas, justifica por qué no era necesario.

Justificación: No utilicé `SECURITY DEFINER` en los procedures. Se optó por mantener el comportamiento por defecto (`SECURITY INVOKER`) para respetar la arquitectura de Row-Level Security (RLS). Si el procedure de agendar citas se ejecutara como el dueño de la tabla (`SECURITY DEFINER`), ignoraría los filtros de RLS, abriendo una brecha donde un veterinario podría agendar citas a mascotas que no le pertenecen. En su lugar, se otorgaron permisos `GRANT EXECUTE` y `GRANT INSERT` explícitos a los roles correspondientes.

### 4. ¿Qué TTL le pusiste al caché Redis y por qué ese valor específico? ¿Qué pasaría si fuera demasiado bajo? ¿Demasiado alto?

Valor Elegido: 60 segundos.

Justificación: Es un reporte pesado que cruza datos, por lo que 1 minuto es un balance ideal para absorber picos de consultas concurrentes sin mostrar información obsoleta.

Si fuera demasiado bajo (ej. 1 segundo): Perderíamos el beneficio del caché, ya que PostgreSQL seguiría recibiendo la carga de la mayoría de las peticiones.

Si fuera demasiado alto (ej. 1 hora): El personal de recepción vería a pacientes como "Pendientes de vacuna" a pesar de que el veterinario ya los hubiera vacunado hace 45 minutos. 

### 5. Tu frontend manda input del usuario al backend. Elige un endpoint crítico y pega la línea exacta donde el backend maneja ese input antes de enviarlo a la base de datos. Explica qué protege esa línea y de qué. Indica archivo y número de línea.

Endpoint: Búsqueda de Mascotas (``GET /api/mascotas/buscar``)
Archivo: `api/index.js` (Línea 118 aprox.)
Código de Protección:
```js
const values = [`%${nombre}%`];
const result = await pool.query(query, values);
```
Explicación: Esta línea protege estrictamente contra ataques de SQL Injection (SQLi). Al usar el arreglo `values` para mapear el placeholder `$1` en la consulta, el driver de `pg` separa por completo los datos del código ejecutable. Cualquier intento de inyección (como un `; DROP TABLE mascotas;`) es tratado literalmente como una cadena de texto inofensiva.

### 6. Si revocas todos los permisos del rol de veterinario excepto SELECT en mascotas, ¿qué deja de funcionar en tu sistema? Lista tres operaciones que se romperían.

Si dejamos al `rol_veterinario` únicamente con `SELECT` en `mascotas`, se romperían las siguientes operaciones:

1.Agendar nuevas consultas: Fallaría por falta de permiso `INSERT` en la tabla `citas` o `EXECUTE` en el procedure. (Error esperado: permission denied for table citas).

2.Registrar vacunas aplicadas: Fallaría por falta de permiso `INSERT` en la tabla `vacunas_aplicadas`. (Error esperado: permission denied for table vacunas_aplicadas).

3.Ver calendario de pacientes agendados: Fallaría por falta de permiso `SELECT` en la tabla `citas`, dejando su dashboard vacío. (Error esperado: permission denied for table citas).
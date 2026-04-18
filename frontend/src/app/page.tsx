"use client";

import { useState, useEffect } from 'react';

// ============================================================================
// INTERFACES (Tipos de TypeScript)
// ============================================================================
interface Cita {
  id: number;
  fecha_hora: string;
  motivo: string;
}

interface Mascota {
  id: number;
  nombre: string;
  especie: string;
  dueno: string;
}

interface Usuario {
  rol: string;
  vetId: string | null;
  nombre: string;
}

export default function DashboardVeterinaria() {
  const [citas, setCitas] = useState<Cita[]>([]);
  const [mascotas, setMascotas] = useState<Mascota[]>([]);
  const [busqueda, setBusqueda] = useState<string>('');
  
  const [usuarioActivo, setUsuarioActivo] = useState<Usuario>({
    rol: 'rol_administrador',
    vetId: null,
    nombre: 'Administrador Global'
  });

  const usuariosPrueba: Usuario[] = [
    { rol: 'rol_administrador', vetId: null, nombre: 'Administrador Global' },
    { rol: 'rol_recepcion', vetId: null, nombre: 'Recepción (Citas Generales)' },
    { rol: 'rol_veterinario', vetId: '1', nombre: 'Dr. López (Vet 1)' },
    { rol: 'rol_veterinario', vetId: '2', nombre: 'Dra. García (Vet 2)' },
  ];

  const fetchCitas = async () => {
    try {
      const headers: HeadersInit = {
        'x-rol': usuarioActivo.rol,
      };
      if (usuarioActivo.vetId) {
        headers['x-vet-id'] = usuarioActivo.vetId;
      }

      const response = await fetch('http://localhost:3000/api/citas', { headers });
      const data: Cita[] = await response.json();
      setCitas(data);
    } catch (error) {
      console.error("Error al cargar citas:", error);
    }
  };

 const buscarMascotas = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch(`http://localhost:3000/api/mascotas/buscar?nombre=${busqueda}`);
      if (!response.ok) {
        setMascotas([]);
        return;
      }
      
      const data: Mascota[] = await response.json();
      setMascotas(data);
    } catch (error) {
      console.error("Error al buscar:", error);
      setMascotas([]);
    }
  };

  useEffect(() => {
    fetchCitas();
  }, [usuarioActivo]);

  return (
    <div className="min-h-screen bg-gray-50 p-8 font-sans">
      <h1 className="text-3xl font-bold text-gray-800 mb-8">Dashboard Clínica Veterinaria</h1>

      {/* --- PANEL DE SIMULACIÓN DE LOGIN (RLS) --- */}
      <div className="bg-white p-6 rounded-lg shadow-md mb-8 border-l-4 border-blue-500">
        <h2 className="text-xl font-semibold mb-4 text-gray-700">1. Simulación de Contexto (RLS)</h2>
        <div className="flex gap-4">
          {usuariosPrueba.map((usr) => (
            <button
              key={usr.nombre}
              onClick={() => setUsuarioActivo(usr)}
              className={`px-4 py-2 rounded transition-colors ${
                usuarioActivo.nombre === usr.nombre 
                  ? 'bg-blue-600 text-white shadow' 
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {usr.nombre}
            </button>
          ))}
        </div>
        <p className="mt-4 text-sm text-gray-600">
          Viendo datos como: <strong>{usuarioActivo.nombre}</strong> (Total Citas: {citas.length || 0})
        </p>
        
        {/* Tabla de Citas */}
        <div className="mt-4 bg-gray-100 p-4 rounded max-h-60 overflow-y-auto">
          {citas.length > 0 ? (
             <ul className="space-y-2">
               {citas.map(cita => (
                 <li key={cita.id} className="bg-white p-2 border rounded shadow-sm text-gray-800">
                   Cita #{cita.id} | Fecha: {new Date(cita.fecha_hora).toLocaleDateString()} | Motivo: {cita.motivo}
                 </li>
               ))}
             </ul>
          ) : (
            <p className="text-gray-500">No hay citas visibles para este usuario.</p>
          )}
        </div>
      </div>

      {/* --- PANEL DE BUSCADOR (HARDENING) --- */}
      <div className="bg-white p-6 rounded-lg shadow-md border-l-4 border-green-500">
        <h2 className="text-xl font-semibold mb-4 text-gray-700">2. Buscador de Mascotas (Defensa SQLi)</h2>
        <form onSubmit={buscarMascotas} className="flex gap-4 mb-4">
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Ej. Firulais o ' OR 1=1 --"
            className="flex-1 p-2 border rounded text-black focus:outline-none focus:ring-2 focus:ring-green-400"
          />
          <button type="submit" className="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700">
            Buscar
          </button>
        </form>

        {/* Resultados de búsqueda */}
        <div className="bg-gray-100 p-4 rounded min-h-[100px]">
          {mascotas.length > 0 ? (
            <ul className="space-y-2">
              {mascotas.map(mascota => (
                <li key={mascota.id} className="bg-white p-2 border rounded shadow-sm text-gray-700">
                  🐾 <strong>{mascota.nombre}</strong> ({mascota.especie}) - Dueño: {mascota.dueno}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500 text-sm">Realiza una búsqueda para ver los resultados.</p>
          )}
        </div>
      </div>

    </div>
  );
}
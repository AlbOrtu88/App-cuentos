-- Catálogo anónimo de cuentos para elegir los mejores y publicarlos en libros (KDP).
-- Sin nombres (se sustituyen por marcas al guardar) y sin relación con el usuario:
-- el id es aleatorio y distinto del id del cuento en la app.
CREATE TABLE IF NOT EXISTS cuentos (
  id TEXT PRIMARY KEY,
  titulo TEXT NOT NULL,
  parrafos TEXT NOT NULL,          -- JSON con los párrafos ya anonimizados
  rango_edad TEXT NOT NULL,        -- '0-1', '2-3', '4-5', '6-7' u '8-10'
  moraleja TEXT NOT NULL,          -- id de LESSONS (dark, share, ...)
  minutos INTEGER NOT NULL,
  estilo TEXT NOT NULL,
  mes TEXT NOT NULL,               -- AAAA-MM en que se creó
  aperturas INTEGER NOT NULL DEFAULT 0,       -- veces que se reabre desde «Mis cuentos»
  escuchas INTEGER NOT NULL DEFAULT 0,        -- veces que se pulsa «Escuchar»
  compartidos INTEGER NOT NULL DEFAULT 0,     -- enlaces creados para los abuelos
  aperturas_enlace INTEGER NOT NULL DEFAULT 0 -- veces que se abre el enlace de los abuelos
);
CREATE INDEX IF NOT EXISTS cuentos_edad ON cuentos (rango_edad, moraleja);

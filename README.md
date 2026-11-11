# Mi gimnasio

App personal en español para registrar sesiones de gimnasio, básquet y medidas corporales. Usa Expo, React Native y TypeScript con los mismos componentes para web, iOS y Android.

## Desarrollo

- Instalar: `npm ci`
- Abrir en el navegador: `npm run web`
- Iniciar Expo: `npm start`
- Revisar tipos: `npm run typecheck`
- Exportar la web a `dist/`: `npm run build`

Configurá las cuatro rutinas desde Entrenar. Agregá los ejercicios, la máquina o su ajuste y el número de series. En cada sesión podés confirmar las series por separado y cargar las calorías activas de Garmin de forma opcional. El calendario abre las sesiones para revisarlas o editarlas.

Los registros y el entrenamiento en curso quedan guardados en el navegador o la instalación donde los cargás. Si abrís la app desde otro dominio o dispositivo, vas a empezar con un historial vacío. La web de GitHub Pages abre sin cuenta. La conexión del chat a un modelo queda pendiente.

## Publicar en GitHub Pages

1. Creá el repo de GitHub y subí el contenido del ZIP, incluidos los archivos y carpetas que empiezan con un punto, a la raíz de la rama `main`.
2. En **Settings → Pages → Build and deployment**, elegí **GitHub Actions** como origen.
3. En **Actions**, abrí **Publicar en GitHub Pages** y ejecutalo con **Run workflow** sobre `main`. GitHub muestra el enlace de la app cuando termina. Los próximos cambios en `main` se publican automáticamente.

El flujo compila solo los archivos de la app y adapta sus rutas a la URL del repo. Cualquier persona con acceso a la URL puede abrir la app en su propio navegador. Las rutinas, sesiones y medidas que cargás quedan en tu dispositivo y no forman parte del sitio publicado.
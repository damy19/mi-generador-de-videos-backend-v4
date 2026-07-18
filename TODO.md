# TODO - Quitar Kling y dejar solo Fal

- [x] Editar `backend/src/controllers/videoController.js`: eliminar todo lo relacionado con Kling (env vars, interceptor, provider/klingTaskId, polling en `obtenerEstadoVideo`).
- [x] Editar `backend/src/controllers/videoController.js`: asegurar que `crearVideo` solo use Fal y guarde siempre `provider: "fal"` y `falRequestId`.
- [x] Editar `backend/src/routes/videoRoutes.js`: eliminar/ajustar endpoint `status` si dependía de Kling.



- [ ] Editar `frontend/src/app/dashboard/page.tsx`: quitar botón "Premium 2.0 (Kling)", eliminar soporte de `premium2kling` y de "Imagen de Referencia".
- [ ] Mantener 4 modelos Fal: `cheap`, `normal`, `full`, `premium`.
- [ ] Verificar que el reproductor aparezca automáticamente al completarse (sin F5) usando el polling existente.



# Logic Analyzer – Web Serial + Canvas (TypeScript)

Port profesional desde Processing a **HTML5 Canvas + Web Serial** con arquitectura modular y código mantenible.

## Estructura de archivos

```
logic-analyzer-webserial-ts/
├─ index.html
├─ styles.css
├─ package.json
├─ tsconfig.json
├─ vite.config.ts
└─ src/
   ├─ main.ts          # Arranque de UI y wiring de eventos
   ├─ controller.ts    # Orquesta transporte, modelo y vista
   ├─ model.ts         # Buffer de captura y procesamiento
   ├─ view.ts          # Dibujo Canvas + interacción
   ├─ serial.ts        # Web Serial y simulador (sin hardware)
   ├─ constants.ts     # Constantes de UI y mapeos
   ├─ utils.ts         # Helpers varios
   └─ types.ts         # Tipos compartidos
```

## Uso

1. **Instalar** dependencias
   ```bash
   npm i
   ```
2. **Desarrollo**
   ```bash
   npm run dev
   ```
   Abre el puerto en **https://** o usa el simulador. Chrome/Edge soportan Web Serial.
3. **Simulación** (sin hardware)
   - Pulsa **Simular** y luego **Start** para ver señales generadas.
4. **Build**
   ```bash
   npm run build && npm run preview
   ```

## Notas de diseño
- Separación Modelo/Vista/Controlador.
- Sin "números mágicos": constantes documentadas.
- Render **HiDPI** + redibujado bajo demanda.
- Web Serial robusto con parseo por líneas y limpieza de recursos.
- **Extensible**: añade más placas en `constants.ts` y personaliza `pinAssignment`.
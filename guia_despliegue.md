# Guía de Despliegue en Producción (Luma)

He separado el código fuente de Luma en dos carpetas limpias que están fuera del antiguo proyecto `pareja-virtual`:
- **`luma-server/`**: Contiene exclusivamente el código del backend en Express.
- **`luma-web/`**: Contiene exclusivamente el código del frontend en Vite/JavaScript.

Ambas carpetas **no** tienen la carpeta `node_modules`, por lo que son muy ligeras. Simplemente comprime estas carpetas y súbelas donde corresponda siguiendo esta guía.

---

## 1. Desplegando el Backend en tu Servidor Linux (VPS)

Asumiremos que tu servidor tiene Ubuntu o Debian. Inicia sesión en tu servidor por SSH.

### Paso A: Instalar Node.js y PM2
```bash
# 1. Actualizar repositorios
sudo apt update && sudo apt upgrade -y

# 2. Instalar Node.js (Versión 20 o superior recomendada)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 3. Instalar PM2 (Gestor de procesos para mantener tu servidor encendido 24/7)
sudo npm install -g pm2
```

### Paso B: Subir e Instalar el Código
1. Sube la carpeta **`luma-server/`** a tu servidor (puedes usar un programa como FileZilla, WinSCP, o hacerlo por Git).
2. Entra a la carpeta del proyecto en tu servidor:
   ```bash
   cd ruta/a/tu/luma-server
   ```
3. Instala las dependencias:
   ```bash
   npm install
   ```
4. Asegúrate de crear/subir el archivo **`.env`** dentro de esa carpeta con tus claves reales de Supabase, Stripe y OpenRouter.

### Paso C: Arrancar el Servidor
```bash
# Iniciar el servidor con PM2 (se mantendrá corriendo en segundo plano)
pm2 start index.js --name "luma-api"

# Guardar la lista de procesos para que se inicie solo si el servidor se reinicia
pm2 save
pm2 startup
```

> [!TIP]
> Tu servidor ahora correrá en el puerto **3001** (`http://IP_DE_TU_SERVIDOR:3001`). Lo ideal es que instales NGINX y lo uses como proxy inverso con un dominio (ej. `api.luma.com`) y le pongas un certificado SSL gratuito con Certbot.

---

## 2. Desplegando el Frontend en Cloudflare Pages

Esta parte es gratuita e increíblemente rápida. 

### Paso A: Preparar el archivo `.env`
Dentro de la carpeta **`luma-web`**, edita el archivo `.env` y asegúrate de que apunta a tu servidor Linux (o tu dominio, si le pusiste uno):
```env
VITE_SUPABASE_URL=https://ztevbotdejdxeartjgrn.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_3F90ZfnToGnClrsQALMNZQ_P8sNBRKg
VITE_API_URL=https://api.luma.com   <-- (La URL real de tu servidor Linux)
```

### Paso B: Subir a Cloudflare
Tienes dos formas de hacerlo: **Manual** (arrastrar y soltar) o mediante **GitHub**.

#### Opción 1: Arrastrar y Soltar (Direct Deployment - Más rápido para empezar)
1. En tu computadora (local), entra a la carpeta `luma-web` y construye el proyecto:
   ```bash
   npm install
   npm run build
   ```
2. Esto creará una carpeta llamada **`dist/`**.
3. Inicia sesión en [Cloudflare Dashboard](https://dash.cloudflare.com/).
4. En la barra lateral, ve a **Workers & Pages**.
5. Haz clic en el botón azul **Create application** (Crear aplicación).
6. Selecciona la pestaña **Pages** y haz clic en **Upload assets** (Subir archivos).
7. Escribe el nombre del proyecto (ej. `luma-app`) y haz clic en crear.
8. Arrastra la carpeta **`dist/`** completa hacia la pantalla. Cloudflare la subirá.
9. ¡Listo! Te dará un dominio gratis como `https://luma-app.pages.dev`.

#### Opción 2: Usar GitHub (Recomendado para actualizaciones automáticas)
1. Sube tu carpeta `luma-web` (incluyendo el código fuente, no el `dist`) a un repositorio privado en GitHub.
2. En Cloudflare ve a **Workers & Pages** -> **Create application** -> **Pages** -> **Connect to Git**.
3. Selecciona tu repositorio de `luma-web`.
4. En **Framework preset** selecciona **Vite**. Cloudflare detectará que el comando de build es `npm run build` y la carpeta de salida es `dist`.
5. En la sección "Environment Variables (Advanced)", añade la variable `VITE_API_URL` apuntando a tu servidor.
6. Haz clic en Save and Deploy.
7. ¡Listo! A partir de ahora, cada vez que subas un cambio a tu GitHub, Cloudflare actualizará la web automáticamente en segundos.

---

Con esto, tendrás un Frontend súper veloz y seguro alojado globalmente en Cloudflare, conectado a un Backend poderoso e independiente en tu VPS Linux.

import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';

const isFirefox = process.env.TARGET === 'firefox';

export default defineConfig(({ mode }) => {
  // Load env file based on mode (development/production)
  const env = loadEnv(mode, process.cwd(), '');

  return {
  build: {
    rollupOptions: {
      input: {
        background: isFirefox
          ? resolve(__dirname, 'src/background/background-firefox.ts')
          : resolve(__dirname, 'src/background/background.ts'),
        popup: isFirefox
          ? resolve(__dirname, 'src/popup/popup-firefox.ts')
          : resolve(__dirname, 'src/popup/popup.ts'),
        'otp-bridge': resolve(__dirname, 'src/content/otp-bridge.ts'),
        'otp-bridge-firefox': isFirefox
          ? resolve(__dirname, 'src/content/otp-bridge-firefox.ts')
          : resolve(__dirname, 'src/content/otp-bridge.ts')
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]',
        // Inline all modules into each entry point to avoid ES module imports
        manualChunks: () => null
      }
    },
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2017',
    lib: false
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  define: {
    __CHROME_CLIENT_ID__: JSON.stringify(env.CHROME_CLIENT_ID || ''),
    __CHROME_CLIENT_SECRET__: JSON.stringify(env.CHROME_CLIENT_SECRET || ''),
    __FIREFOX_CLIENT_ID__: JSON.stringify(env.FIREFOX_CLIENT_ID || ''),
    __FIREFOX_CLIENT_SECRET__: JSON.stringify(env.FIREFOX_CLIENT_SECRET || '')
  },
  plugins: [
    {
      name: 'copy-extension-files',
      writeBundle(options) {
        const distDir = options.dir || resolve(__dirname, 'dist');
        
        // Copy and process appropriate manifest with client ID injection
        const manifestSrc = isFirefox 
          ? resolve(__dirname, 'src/manifest-firefox.json')
          : resolve(__dirname, 'src/manifest.json');
        
        let manifestContent = readFileSync(manifestSrc, 'utf8');
        
        // Replace client ID placeholders with environment variables
        const chromeClientId = env.CHROME_CLIENT_ID || '';
        const firefoxClientId = env.FIREFOX_CLIENT_ID || '';
        
        manifestContent = manifestContent.replace('__CHROME_CLIENT_ID__', chromeClientId);
        manifestContent = manifestContent.replace('__FIREFOX_CLIENT_ID__', firefoxClientId);
        
        writeFileSync(resolve(distDir, 'manifest.json'), manifestContent);
        
        // Copy appropriate popup HTML for each browser
        const popupHtmlSrc = isFirefox 
          ? resolve(__dirname, 'src/popup/popup.html')  // Firefox uses polyfill
          : resolve(__dirname, 'src/popup/popup-chrome.html');  // Chrome uses native APIs
        
        copyFileSync(popupHtmlSrc, resolve(distDir, 'popup.html'));
        
        // Create icons directory and copy icons
        const iconsDir = resolve(distDir, 'icons');
        if (!existsSync(iconsDir)) {
          mkdirSync(iconsDir, { recursive: true });
        }
        
        [16, 32, 48, 128].forEach(size => {
          const srcIcon = resolve(__dirname, `src/icons/icon${size}.png`);
          const distIcon = resolve(iconsDir, `icon${size}.png`);
          if (existsSync(srcIcon)) {
            copyFileSync(srcIcon, distIcon);
          }
        });
        
        // Copy browser-polyfill.js only for Firefox (background script needs it)
        if (isFirefox) {
          const polyfillSrc = resolve(__dirname, 'node_modules/webextension-polyfill/dist/browser-polyfill.js');
          const polyfillDist = resolve(distDir, 'browser-polyfill.js');
          if (existsSync(polyfillSrc)) {
            copyFileSync(polyfillSrc, polyfillDist);
          }
        }
        
        console.log(`✓ ${isFirefox ? 'Firefox' : 'Chrome'} extension files copied`);
      }
    }
  ]
  };
});
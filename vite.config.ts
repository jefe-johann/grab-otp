import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';

const isFirefox = process.env.TARGET === 'firefox';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        background: isFirefox 
          ? resolve(__dirname, 'src/background/background-firefox.ts')
          : resolve(__dirname, 'src/background/background.ts'),
        popup: isFirefox
          ? resolve(__dirname, 'src/popup/popup-firefox.ts')
          : resolve(__dirname, 'src/popup/popup.ts')
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]'
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
    __CHROME_CLIENT_ID__: JSON.stringify(process.env.CHROME_CLIENT_ID || '502151418270-o0t7rkbbrrjmlp2k7khjhfs47eovo5kc.apps.googleusercontent.com'),
    __FIREFOX_CLIENT_ID__: JSON.stringify(process.env.FIREFOX_CLIENT_ID || '502151418270-9qtnoglkkeb06mt64hli30hs9lsthj9e.apps.googleusercontent.com')
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
        const chromeClientId = process.env.CHROME_CLIENT_ID || '502151418270-o0t7rkbbrrjmlp2k7khjhfs47eovo5kc.apps.googleusercontent.com';
        const firefoxClientId = process.env.FIREFOX_CLIENT_ID || '502151418270-9qtnoglkkeb06mt64hli30hs9lsthj9e.apps.googleusercontent.com';
        
        manifestContent = manifestContent.replace('__CHROME_CLIENT_ID__', chromeClientId);
        manifestContent = manifestContent.replace('__FIREFOX_CLIENT_ID__', firefoxClientId);
        
        writeFileSync(resolve(distDir, 'manifest.json'), manifestContent);
        
        // Copy popup HTML
        copyFileSync(
          resolve(__dirname, 'src/popup/popup.html'), 
          resolve(distDir, 'popup.html')
        );
        
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
});
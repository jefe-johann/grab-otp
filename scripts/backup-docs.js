#!/usr/bin/env node

import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.dirname(__dirname);

// Backup destination
const backupPath = path.join(homedir(), 'Jeff/Projects/Project_Backups/Grab-OTP/Docs');

// Private docs to backup (these will be gitignored)
const privateDocsPath = path.join(projectRoot, 'docs', 'private');

console.log('🗃️  Backing up private documentation...');

try {
  // Create backup directory if it doesn't exist
  const backupRoot = path.join(homedir(), 'Jeff/Projects/Project_Backups');
  const backupProject = path.join(backupRoot, 'Grab-OTP');
  
  if (!existsSync(backupRoot)) {
    mkdirSync(backupRoot, { recursive: true });
  }
  
  if (!existsSync(backupProject)) {
    mkdirSync(backupProject, { recursive: true });
  }

  // Remove old backup and copy fresh (overwrites completely)
  if (existsSync(backupPath)) {
    console.log('  📁 Removing previous backup...');
    execSync(`rm -rf "${backupPath}"`);
  }

  // Copy private docs if they exist
  if (existsSync(privateDocsPath)) {
    console.log(`  📋 Copying docs from ${privateDocsPath}...`);
    console.log(`  📋 Backup destination: ${backupPath}`);
    
    // Create parent directory and copy
    mkdirSync(path.dirname(backupPath), { recursive: true });
    execSync(`cp -r "${privateDocsPath}" "${backupPath}"`);
    
    // Count files backed up
    const fileCount = execSync(`find "${backupPath}" -type f | wc -l`).toString().trim();
    console.log(`  ✅ Backed up ${fileCount} private documentation files`);
  } else {
    console.log('  ⚠️  No private docs folder found - skipping backup');
  }

  console.log('  🎯 Documentation backup complete!');

} catch (error) {
  console.error('❌ Error backing up docs:', error.message);
  // Don't fail the build for backup errors
  console.log('⚠️  Build will continue without backup...');
}
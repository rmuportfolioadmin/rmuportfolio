#!/usr/bin/env node

/**
 * Standalone cleanup script for portfolio temporary files
 * Can be run via cron job or manual execution
 */

import { google } from 'googleapis';

// Configuration
const TEMP_FOLDER_NAME = process.env.TEMP_FOLDER_NAME || 'portfolio-temp-storage';
const MAX_AGE_HOURS = parseInt(process.env.CLEANUP_MAX_AGE_HOURS || '24');
const DRIVE_PARENT_FOLDER_ID = process.env.DRIVE_PARENT_FOLDER_ID || '';
const DRY_RUN = (process.env.CLEANUP_DRY_RUN === '1' || process.argv.includes('--dry-run'));

async function cleanupOldTempFiles() {
  try {
    console.log(`[Cleanup] Starting cleanup of temp files older than ${MAX_AGE_HOURS} hours...`);
    
    // Initialize Google Drive API with service account
    const auth = new google.auth.GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/drive']
    });
    const client = await auth.getClient();
    const drive = google.drive({ version: 'v3', auth: client });
    
    // Find temporary folder (prefer under the configured parent folder if provided)
    let folderQueryQ = `name='${TEMP_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    if (DRIVE_PARENT_FOLDER_ID) {
      folderQueryQ += ` and '${DRIVE_PARENT_FOLDER_ID}' in parents`;
    }
    const folderQuery = await drive.files.list({
      q: folderQueryQ,
      fields: 'files(id,name,parents)'
    });
    
    if (!folderQuery.data.files || folderQuery.data.files.length === 0) {
      console.log('[Cleanup] No temporary folder found. Nothing to clean up.');
      return { cleanedCount: 0, errors: [] };
    }
    
    const tempFolderId = folderQuery.data.files[0].id;
    console.log(`[Cleanup] Found temporary folder: ${tempFolderId}`);
    
    // Find temp files older than specified hours
    const cutoffTime = new Date(Date.now() - MAX_AGE_HOURS * 60 * 60 * 1000).toISOString();
    
    const oldFiles = await drive.files.list({
      q: `'${tempFolderId}' in parents and createdTime < '${cutoffTime}' and trashed=false and mimeType='application/json' and appProperties has { key='status' and value='temporary' }`,
      fields: 'files(id,name,createdTime,appProperties,mimeType)',
      pageSize: 1000
    });
    
    console.log(`[Cleanup] Found ${oldFiles.data.files?.length || 0} old temporary files`);
    
    let cleanedCount = 0;
    const errors = [];
    
    for (const file of oldFiles.data.files || []) {
      try {
        if (DRY_RUN) {
          console.log(`[Cleanup][DRY-RUN] Would delete: ${file.name} (created: ${file.createdTime})`);
          continue;
        }
        await drive.files.delete({ fileId: file.id });
        console.log(`[Cleanup] ✓ Deleted: ${file.name} (created: ${file.createdTime})`);
        cleanedCount++;
      } catch (error) {
        const errorMsg = `Failed to delete ${file.name}: ${error.message}`;
        console.error(`[Cleanup] ✗ ${errorMsg}`);
        errors.push(errorMsg);
      }
    }
    
    console.log(`[Cleanup] ✅ Cleanup completed: ${cleanedCount} files deleted, ${errors.length} errors`);
    
    return { cleanedCount, errors };
    
  } catch (error) {
    console.error('[Cleanup] Fatal error:', error);
    throw error;
  }
}

// Storage monitoring function
async function checkStorageUsage() {
  try {
    console.log('[Monitor] Checking storage usage...');
    
    const auth = new google.auth.GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/drive']
    });
    const client = await auth.getClient();
    const drive = google.drive({ version: 'v3', auth: client });
    
    const about = await drive.about.get({
      fields: 'storageQuota'
    });
    
    const quota = about.data.storageQuota;
    const usedBytes = parseInt(quota.usage || 0);
    const limitBytes = parseInt(quota.limit || 0);
    const usedGB = usedBytes / (1024 ** 3);
    const limitGB = limitBytes / (1024 ** 3);
    const usagePercent = limitBytes > 0 ? (usedBytes / limitBytes) * 100 : 0;
    
    console.log(`[Monitor] Storage Usage: ${usedGB.toFixed(2)}GB / ${limitGB.toFixed(2)}GB (${usagePercent.toFixed(1)}%)`);
    
    if (usagePercent > 80) {
      console.warn('[Monitor] ⚠️  WARNING: Storage usage above 80%!');
      // You could send an alert email or notification here
    }
    
    return { usedGB, limitGB, usagePercent };
  } catch (error) {
    console.error('[Monitor] Storage check failed:', error);
    return null;
  }
}

// Main execution
async function main() {
  try {
    const command = process.argv[2] || 'cleanup';
    
    switch (command) {
      case 'cleanup':
        const result = await cleanupOldTempFiles();
        process.exit(result.errors.length > 0 ? 1 : 0);
        break;
        
      case 'monitor':
        await checkStorageUsage();
        process.exit(0);
        break;
        
      case 'both':
        await checkStorageUsage();
        const cleanupResult = await cleanupOldTempFiles();
        process.exit(cleanupResult.errors.length > 0 ? 1 : 0);
        break;

      case 'dry-run':
        process.env.CLEANUP_DRY_RUN = '1';
        await cleanupOldTempFiles();
        process.exit(0);
        break;
        
      default:
        console.log('Usage: node cleanup-script.js [cleanup|monitor|both]');
        console.log('');
        console.log('Commands:');
        console.log('  cleanup  - Remove old temporary files (default)');
        console.log('  monitor  - Check storage usage');
        console.log('  both     - Monitor storage and cleanup files');
        console.log('');
        console.log('Environment variables:');
        console.log('  TEMP_FOLDER_NAME       - Name of temporary folder (default: portfolio-temp-storage)');
        console.log('  CLEANUP_MAX_AGE_HOURS  - Max age of files to keep (default: 24)');
        process.exit(0);
    }
  } catch (error) {
    console.error('[Main] Script failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { cleanupOldTempFiles, checkStorageUsage };
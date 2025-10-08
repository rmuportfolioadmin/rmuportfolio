// Improved Save Endpoint - handles service account quota properly
// Add this to your backend server.js

const express = require('express');
const { google } = require('googleapis');
const path = require('path');

// Configuration
const ADMIN_EMAIL = 'rmuportfolioa@gmail.com';
const TEMP_FOLDER_NAME = 'portfolio-temp-storage'; // Folder in service account drive for temporary storage
const FINAL_FOLDER_NAME = 'student-portfolios'; // Folder in admin drive for final storage

// Initialize Google APIs
const serviceAuth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE,
    scopes: [
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/drive.file'
    ]
});

const adminAuth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_ADMIN_KEY_FILE, // Separate key file for admin account
    scopes: [
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/drive.file'
    ]
});

const serviceDrive = google.drive({ version: 'v3', auth: serviceAuth });
const adminDrive = google.drive({ version: 'v3', auth: adminAuth });

// Enhanced save endpoint
app.post('/api/save', async (req, res) => {
    try {
        console.log('[Save] Processing save request...');
        
        const { roll, email, filename, portfolio, metadata } = req.body;
        
        // Validate required fields
        if (!email || !filename || !portfolio) {
            return res.status(400).json({ 
                error: 'Missing required fields: email, filename, or portfolio data' 
            });
        }
        
        // Validate email format and content
        if (!isValidEmail(email) || !isValidPortfolioData(portfolio)) {
            return res.status(400).json({ 
                error: 'Invalid email format or portfolio data' 
            });
        }
        
        console.log(`[Save] Validated request for ${email}, filename: ${filename}`);
        
        // Step 1: Save to temporary storage in service account drive
        const tempFileId = await saveToTemporaryStorage(filename, portfolio, email, metadata);
        console.log(`[Save] Saved to temporary storage: ${tempFileId}`);
        
        // Step 2: Validate and process the file
        const validationResult = await validatePortfolioFile(tempFileId, email, portfolio);
        if (!validationResult.isValid) {
            // Clean up temporary file
            await cleanupTempFile(tempFileId);
            return res.status(400).json({ 
                error: 'Portfolio validation failed: ' + validationResult.error 
            });
        }
        
        // Step 3: Transfer to admin drive
        const finalFileId = await transferToAdminDrive(tempFileId, filename, email, portfolio);
        console.log(`[Save] Transferred to admin drive: ${finalFileId}`);
        
        // Step 4: Clean up temporary storage
        await cleanupTempFile(tempFileId);
        console.log(`[Save] Cleaned up temporary file: ${tempFileId}`);
        
        // Step 5: Update files.json manifest
        await updateFilesManifest(filename, email, roll);
        
        res.json({
            success: true,
            fileId: finalFileId,
            message: 'Portfolio saved successfully',
            filename: filename + '.json'
        });
        
    } catch (error) {
        console.error('[Save] Error:', error);
        
        // Provide user-friendly error messages
        if (error.message.includes('quota')) {
            res.status(507).json({
                error: 'Storage temporarily full. Please contact the administrator.',
                details: 'The temporary storage is at capacity. This will be resolved shortly.'
            });
        } else if (error.message.includes('permissions')) {
            res.status(403).json({
                error: 'Permission error. Please try signing out and signing in again.',
                details: 'Authentication token may have expired.'
            });
        } else {
            res.status(500).json({
                error: 'Internal server error. Please try again later.',
                details: process.env.NODE_ENV === 'development' ? error.message : 'Contact support if this persists.'
            });
        }
    }
});

// Helper function: Save to temporary storage in service account drive
async function saveToTemporaryStorage(filename, portfolio, email, metadata) {
    try {
        // Ensure temporary folder exists
        let tempFolderId = await getOrCreateFolder(serviceDrive, TEMP_FOLDER_NAME);
        
        const content = JSON.stringify({
            portfolio,
            metadata: {
                ...metadata,
                email,
                uploadedAt: new Date().toISOString(),
                status: 'temporary'
            }
        }, null, 2);
        
        const fileMetadata = {
            name: `${filename}-temp-${Date.now()}.json`,
            parents: [tempFolderId],
            description: `Temporary portfolio file for ${email}`
        };
        
        const media = {
            mimeType: 'application/json',
            body: content
        };
        
        const response = await serviceDrive.files.create({
            resource: fileMetadata,
            media: media,
            fields: 'id,name'
        });
        
        return response.data.id;
    } catch (error) {
        console.error('[TempSave] Error saving to temporary storage:', error);
        throw new Error('Failed to save to temporary storage: ' + error.message);
    }
}

// Helper function: Validate portfolio file
async function validatePortfolioFile(tempFileId, email, portfolio) {
    try {
        console.log('[Validate] Validating portfolio file...');
        
        // Basic validation checks
        const checks = {
            hasPersonalInfo: !!(portfolio.personalInfo && Object.keys(portfolio.personalInfo).length > 0),
            hasValidEmail: isValidEmail(email),
            hasAchievements: Array.isArray(portfolio.achievements),
            hasReflections: Array.isArray(portfolio.reflections),
            reasonableSize: JSON.stringify(portfolio).length < 10 * 1024 * 1024 // 10MB limit
        };
        
        const failedChecks = Object.entries(checks)
            .filter(([key, passed]) => !passed)
            .map(([key]) => key);
        
        if (failedChecks.length > 0) {
            return {
                isValid: false,
                error: `Validation failed: ${failedChecks.join(', ')}`
            };
        }
        
        // Additional content validation
        if (portfolio.personalInfo && portfolio.personalInfo.rollNo) {
            const rollPattern = /^\d{1,3}-?[RS]?\d{2}-?[A-Z]?$/i;
            if (!rollPattern.test(portfolio.personalInfo.rollNo)) {
                return {
                    isValid: false,
                    error: 'Invalid roll number format'
                };
            }
        }
        
        return { isValid: true };
    } catch (error) {
        return {
            isValid: false,
            error: 'Validation process failed: ' + error.message
        };
    }
}

// Helper function: Transfer to admin drive
async function transferToAdminDrive(tempFileId, filename, email, portfolio) {
    try {
        // Get the temporary file content
        const tempFileResponse = await serviceDrive.files.get({
            fileId: tempFileId,
            alt: 'media'
        });
        
        // Ensure final folder exists in admin drive
        let finalFolderId = await getOrCreateFolder(adminDrive, FINAL_FOLDER_NAME);
        
        // Create final file in admin drive
        const fileMetadata = {
            name: `${filename}.json`,
            parents: [finalFolderId],
            description: `Portfolio for ${email} - Uploaded ${new Date().toISOString()}`
        };
        
        // Clean up the content - remove temporary metadata
        const cleanContent = JSON.stringify(portfolio, null, 2);
        
        const media = {
            mimeType: 'application/json',
            body: cleanContent
        };
        
        // Check if file already exists in admin drive
        const existingFiles = await adminDrive.files.list({
            q: `name='${filename}.json' and parents in '${finalFolderId}' and trashed=false`,
            fields: 'files(id,name)'
        });
        
        let response;
        if (existingFiles.data.files && existingFiles.data.files.length > 0) {
            // Update existing file
            const existingFileId = existingFiles.data.files[0].id;
            response = await adminDrive.files.update({
                fileId: existingFileId,
                media: media,
                fields: 'id,name'
            });
        } else {
            // Create new file
            response = await adminDrive.files.create({
                resource: fileMetadata,
                media: media,
                fields: 'id,name'
            });
        }
        
        return response.data.id;
    } catch (error) {
        console.error('[Transfer] Error transferring to admin drive:', error);
        throw new Error('Failed to transfer to final storage: ' + error.message);
    }
}

// Helper function: Clean up temporary file
async function cleanupTempFile(tempFileId) {
    try {
        await serviceDrive.files.delete({
            fileId: tempFileId
        });
        console.log(`[Cleanup] Deleted temporary file: ${tempFileId}`);
    } catch (error) {
        console.warn(`[Cleanup] Failed to delete temporary file ${tempFileId}:`, error.message);
        // Don't throw error - cleanup failure shouldn't fail the whole operation
    }
}

// Helper function: Get or create folder
async function getOrCreateFolder(driveInstance, folderName) {
    try {
        // Check if folder exists
        const folderQuery = await driveInstance.files.list({
            q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            fields: 'files(id,name)'
        });
        
        if (folderQuery.data.files && folderQuery.data.files.length > 0) {
            return folderQuery.data.files[0].id;
        }
        
        // Create folder if it doesn't exist
        const folderMetadata = {
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder'
        };
        
        const folder = await driveInstance.files.create({
            resource: folderMetadata,
            fields: 'id'
        });
        
        return folder.data.id;
    } catch (error) {
        throw new Error('Failed to create/access folder: ' + error.message);
    }
}

// Helper function: Update files.json manifest
async function updateFilesManifest(filename, email, roll) {
    try {
        // This would update your files.json to include the new portfolio
        // Implementation depends on how you want to manage the manifest
        console.log(`[Manifest] Would update manifest for ${filename}`);
    } catch (error) {
        console.warn('[Manifest] Failed to update manifest:', error.message);
        // Don't throw - manifest update failure shouldn't fail the save
    }
}

// Validation helpers
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function isValidPortfolioData(portfolio) {
    return portfolio && 
           typeof portfolio === 'object' &&
           (Array.isArray(portfolio.achievements) || portfolio.achievements === undefined) &&
           (Array.isArray(portfolio.reflections) || portfolio.reflections === undefined);
}

module.exports = {
    saveToTemporaryStorage,
    validatePortfolioFile,
    transferToAdminDrive,
    cleanupTempFile
};
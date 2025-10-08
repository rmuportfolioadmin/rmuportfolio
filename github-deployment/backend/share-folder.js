const { google } = require('googleapis');
const path = require('path');

async function shareFolderWithServiceAccount() {
  try {
    // Initialize Drive API with service account
    const auth = new google.auth.GoogleAuth({
      keyFile: path.join(__dirname, 'service-account.json'),
      scopes: ['https://www.googleapis.com/auth/drive']
    });
    
    const drive = google.drive({ version: 'v3', auth });
    
    const folderId = '1mhOmMsq913sNiHbRc2xr7R4eBbQlryMa';
    const serviceAccountEmail = 'rmu-portfolio-backend@rmu-portfolio-admin.iam.gserviceaccount.com';
    
    console.log(`Sharing folder ${folderId} with ${serviceAccountEmail}...`);
    
    // Share the folder with the service account
    const permission = {
      role: 'writer',
      type: 'user',
      emailAddress: serviceAccountEmail
    };
    
    const response = await drive.permissions.create({
      fileId: folderId,
      resource: permission,
      sendNotificationEmail: false
    });
    
    console.log('Folder shared successfully!');
    console.log('Permission ID:', response.data.id);
    
    // Verify the folder is accessible
    const folderInfo = await drive.files.get({
      fileId: folderId,
      fields: 'id,name,permissions'
    });
    
    console.log('Folder info:', folderInfo.data.name);
    console.log('Current permissions:', folderInfo.data.permissions?.length || 0);
    
  } catch (error) {
    console.error('Error sharing folder:', error.message);
    if (error.code === 404) {
      console.error('Folder not found. Please check the folder ID.');
    } else if (error.code === 403) {
      console.error('Insufficient permissions. Make sure the service account has Drive API access.');
    }
  }
}

shareFolderWithServiceAccount();
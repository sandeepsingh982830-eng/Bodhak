
export interface DriveFile {
    id: string;
    name: string;
    mimeType: string;
    thumbnailLink?: string;
    size?: string;
    modifiedTime?: string;
}

export const listDriveFiles = async (accessToken: string, folderId: string = 'root'): Promise<DriveFile[]> => {
    const q = `'${folderId}' in parents and (mimeType = 'application/pdf' or mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' or mimeType = 'text/plain' or mimeType = 'application/vnd.google-apps.folder') and trashed = false`;
    const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,thumbnailLink,size,modifiedTime)&orderBy=folder,name`, {
        headers: {
            'Authorization': `Bearer ${accessToken}`
        }
    });

    if (!response.ok) {
        throw new Error('Failed to fetch files from Google Drive');
    }

    const data = await response.json();
    return data.files || [];
};

export const getDriveFileContent = async (accessToken: string, fileId: string): Promise<Blob> => {
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: {
            'Authorization': `Bearer ${accessToken}`
        }
    });

    if (!response.ok) {
        throw new Error('Failed to download file from Google Drive');
    }

    return await response.blob();
};

export const searchDriveFiles = async (accessToken: string, query: string): Promise<DriveFile[]> => {
    const q = `name contains '${query}' and (mimeType = 'application/pdf' or mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' or mimeType = 'text/plain') and trashed = false`;
    const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,thumbnailLink,size,modifiedTime)`, {
        headers: {
            'Authorization': `Bearer ${accessToken}`
        }
    });

    if (!response.ok) {
        throw new Error('Failed to search files in Google Drive');
    }

    const data = await response.json();
    return data.files || [];
};

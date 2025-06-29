import { BlobSASPermissions, BlobServiceClient } from "@azure/storage-blob";

export function getBlobStorageClient() {
    return BlobServiceClient.fromConnectionString(process.env.AzureBlobStorageConnString as string);
}


export async function generateImageSASToken(fileName: string): Promise<string> {
    const blobServiceClient = getBlobStorageClient();
    const containerClient = blobServiceClient.getContainerClient(process.env.blobContainerName as string);
    const blobClient = containerClient.getBlobClient(`pdf/${fileName}`);
    
    return await blobClient.generateSasUrl({
        permissions: BlobSASPermissions.parse("r"),
        expiresOn: new Date(new Date().valueOf() + 3600 * 1000) // 1h
    });
}
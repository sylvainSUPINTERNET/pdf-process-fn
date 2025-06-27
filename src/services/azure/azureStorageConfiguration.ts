import { BlobServiceClient } from "@azure/storage-blob";

export function getBlobStorageClient() {
    return BlobServiceClient.fromConnectionString(process.env.AzureBlobStorageConnString as string);
}
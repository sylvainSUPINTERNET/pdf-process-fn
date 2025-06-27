import { InvocationContext } from "@azure/functions";
import pLimit from "p-limit";
import mupdf from "mupdf";
import { ContainerClient } from "@azure/storage-blob";
import { getBlobStorageClient } from "../azure/azureStorageConfiguration.js";

export async function getProjectThumbnails(projectId:string, continuationToken:string, maxPageSize:number, dpi:number, context: InvocationContext): Promise<{
    continuationToken: string,
    images: {name: string, b64:string}[]
}> {
    if ( projectId === undefined || projectId === null || projectId === "" ) {
        throw new Error("Project ID is missing in the request parameters.");
    }

    const containerClient: ContainerClient = getBlobStorageClient().getContainerClient(process.env.blobContainerName as string);

    let pageSettings = {
      maxPageSize
    }

    if ( continuationToken ) {
      pageSettings['continuationToken'] = continuationToken;
    }

    const iterator = containerClient
                        .listBlobsFlat(
                        { 
                            prefix: `pdf/${projectId}/`,
                            includeCopy:false,
                            includeDeleted: false,
                            includeSnapshots: false,
                            includeMetadata: true,
                            includeTags: false, 
                            includeVersions: false
                        })
                        .byPage(pageSettings);

    const page = await iterator.next();
    let nextContinuationToken:string = page.value.continuationToken;


    let images: {name: string, b64:string}[] = [];
    if (page.value.segment.blobItems.length !== 0) {
    
      // Concurrency OK here ( download azure not CPU bound )
      const limit = pLimit(20);
      const tasks = page.value.segment.blobItems.map( blobItem =>
        limit(async () => {

          // is I/O here ( concurrency is enough )
          const { name } = blobItem;
          const blobClient = containerClient.getBlobClient(name);
          const buffer = await blobClient.downloadToBuffer();    

          // it's CPU bound, BUT mupdf is not thread-safe so we are fucked ( concurrency save nothing here ...)
          const pdfDoc = mupdf.PDFDocument.openDocument(Buffer.from(buffer)); // copy for safety
          const page = pdfDoc.loadPage(0);
          const pixmap = page.toPixmap(mupdf.Matrix.scale(dpi / 72, dpi / 72), mupdf.ColorSpace.DeviceRGB, false, true);
          const pngImage = pixmap.asPNG();
          const b64 = Buffer.from(pngImage).toString('base64');

          return {
            name,
            b64
          }

        })
      );
      images = await Promise.all(tasks);
    }

    return {
      "continuationToken": nextContinuationToken, // "" means no more pages
      "images": images !== null ? images.sort((a, b) => {
        const aPageNumber = parseInt(a.name.match(/page_(\d+)\.pdf/)![1]);
        const bPageNumber = parseInt(b.name.match(/page_(\d+)\.pdf/)![1]);
        return aPageNumber - bPageNumber
      }) : []
    };

}

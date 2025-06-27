import { InvocationContext } from '@azure/functions';
import { nanoid } from 'nanoid'
import { Project } from '../../types/Project.js';
import mupdf, { PDFDocument } from 'mupdf';
import pLimit from "p-limit";  
import { padPageNumber } from '../utils/utils.js';
import { getBlobStorageClient } from '../azure/azureStorageConfiguration.js';

export async function prepareDataFromPayload(bodyProjectEstimate: any, creator:string, context: InvocationContext): Promise<Project> {
    let projectEstimateJson = JSON.parse(bodyProjectEstimate as any);
    const project = {   
        projectId: nanoid(),
        name: projectEstimateJson['name'],
        notes: projectEstimateJson['notes'] || '',
        address: projectEstimateJson['address'],
        county: projectEstimateJson['county'],
        state: projectEstimateJson['state'],
        zipCode: projectEstimateJson['zipCode'],
        status: 'CREATED',
        percentages: projectEstimateJson['percentages'],
        type: projectEstimateJson['type'],
        creator,
        creationDate: new Date()
    }

    return project;
}


export async function uploadAndSplit(project:Project, context:InvocationContext, pdfFileBuffer:ArrayBuffer): Promise<{
    projectId: string;
    totalPages: number;  
}> {
      if (pdfFileBuffer.byteLength === 0) {
        throw new Error("Received empty data");
      }
      
      let pdfDocument = mupdf.PDFDocument.openDocument(pdfFileBuffer);
      if (!pdfDocument) {
        throw new Error("Failed to open PDF document");
      }

      // Step 1 : Sequentially extract pages from the PDF ( mandatory because mupdf is not thread-safe ...)
      context.debug("Extracting pages from PDF...");
      const totalPages = pdfDocument.countPages();
      const pageData: { pageNumber: number; data: Uint8Array }[] = [];

      for (let i = 0; i < totalPages; i++) {
        const pageNumber = i + 1;
        context.debug(`  Extracting page ${pageNumber}/${totalPages}...`);
        
        const newDoc = new mupdf.PDFDocument();
        newDoc.graftPage(-1, pdfDocument as PDFDocument, i);
        const buffer = newDoc.saveToBuffer();
        const data = buffer.asUint8Array();
        
        const clonedData = new Uint8Array(data.length);
        clonedData.set(data);
        
        pageData.push({ pageNumber, data: clonedData });
        newDoc.destroy(); // free memory
      }
     context.debug(`  Extracted ${pageData.length} pages`);

      // Step 2: Upload in parallel to Azure Blob Storage
      context.debug("Uploading pages to Azure...");
      const limit = pLimit(5);
      const uploadTasks = pageData.map(({ pageNumber, data }) => 
        limit(async () => {
          try {
            const blobClient = getBlobStorageClient()
              .getContainerClient(`${process.env.blobContainerName as string}/pdf/${project.projectId}`)
              .getBlockBlobClient(`page_${padPageNumber(pageNumber)}.pdf`); // use padding to keep native page order in azure storage ( based on ASCII )

            const resp = await blobClient.uploadData(data, {
              blobHTTPHeaders: {
                blobContentType: 'application/pdf',
                blobContentEncoding: 'binary',
              },
            });

            context.debug(`Page ${pageNumber}/${totalPages} uploaded successfully: ${resp.requestId}`);
            return { success: true, pageNumber, response: resp };
            
          } catch (error) {
            context.debug(`Failed to upload page ${pageNumber}:`, error);
            return { success: false, pageNumber, error };
          }
        })
      );

      const results = await Promise.all(uploadTasks);
      const successful = results.filter(r => r.success);
      const failed = results.filter(r => !r.success);

      context.debug(`Upload completed: ${successful.length}/${totalPages} successful`);

      if (failed.length > 0) {
        context.debug(`  Failed pages: ${failed.map(f => f.pageNumber).join(', ')}`);
        throw new Error(`Failed to upload ${failed.length} pages`);
      }

      context.debug("All uploads done!");
      results.filter(r => r.success).map(r => r.response);

      return {
        projectId: project.projectId,
        totalPages: pdfDocument.countPages()
      }
  }
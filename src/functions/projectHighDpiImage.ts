import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { verifyTokenMain } from "../services/auth/verifyToken.js";
import { BlobServiceClient, BlobUploadCommonResponse, ContainerClient } from "@azure/storage-blob";
import { generateImageSASToken, getBlobStorageClient } from "../services/azure/azureStorageConfiguration.js";
import mupdf from "mupdf";


/**
 * Function run as "background" during preview selection to create as much as possible 220 DPI for the future detection.
 * If some images are selected and the estimation button clicked "too fast", it's fine, missing pictures are generated later before the detection.
 * DPI 220
 * @param request 
 * @param context 
 * @returns 
 */
export async function projectHighDpiImage(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`Project create image High DPI : ${context.invocationId}`);

    // Auth
    let creator;
    if ( request.headers.get('Authorization') === null || request.headers.get('Authorization') === undefined ) {
        context.error(`Authorization header is missing in the request.`);
        return {
            status: 401,
            jsonBody: {
                "message": "Authorization header is required"
            }
        }
    }

    const {sub, error}: {sub:string|null, error:boolean} = await verifyTokenMain(request.headers.get('Authorization'), context);
    if ( error ) {
        return {
            status: 401,
            jsonBody: {
                "message": "Invalid token or token expired. Please provide a valid token."
            }
        }
    } else {
        creator = sub;
        context.log(`Request received from user: ${creator}`); 
    } 
    

    try {
        const dpi = 220;
        const requestBody = await request.json();
        const projectId:string = request.params['projectId'];
        const imageName:string = requestBody['fileName'].split(".")[0]+".png";

        let blobServiceClient:BlobServiceClient = getBlobStorageClient();
        const containerClient = blobServiceClient.getContainerClient(process.env.blobContainerName as string);

        const blobImageClient = containerClient.getBlockBlobClient(`base/${projectId}/${imageName}`);
        let imageExist = await blobImageClient.exists();
        if ( imageExist ) {
            context.log(`Image ${imageName} already exists in project ${projectId}.`);
            return {
                status: 200,
                jsonBody: {
                    message: "Image already exists"
                }
            }
        }

        context.log(`Creating image ${imageName} for project ${projectId}.`);
        // Get PDF page
        const buffer:Buffer = await containerClient.getBlockBlobClient(`pdf/${projectId}/${requestBody['fileName']}`).downloadToBuffer(); 
        if ( buffer.byteLength === 0 ) {
            return {
                status: 500,
                jsonBody: {
                    "message": `Page ${requestBody['fileName']} not found in project ${projectId}.`
                },
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        }

        const pdfDoc = mupdf.PDFDocument.openDocument(buffer);
        const page = pdfDoc.loadPage(0);
        const pixmap = page.toPixmap(mupdf.Matrix.scale(dpi / 72, dpi / 72), mupdf.ColorSpace.DeviceRGB, false, true);
        const pngImage = pixmap.asPNG();
        await blobImageClient.uploadData(pngImage);
        
        return {
            status: 200,
            jsonBody: {
                message: "Image created successfully"
            },
            headers: {
                'Content-Type': 'application/json'
            }
        }

    } catch ( e ) {
        return {
            status: 500,
            jsonBody: {
                message: `Error processing request: ${e.message}`
            },
            headers: {
                'Content-Type': 'application/json'
            }
        }
    }
 
};

app.http('projects-image-high-dpi', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'projects/{projectId}/detection-image/{pdfPageName}',
    handler: projectHighDpiImage
});

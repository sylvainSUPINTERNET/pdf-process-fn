import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { verifyTokenMain } from "../services/auth/verifyToken.js";
import { ContainerClient } from "@azure/storage-blob";
import { getBlobStorageClient } from "../services/azure/azureStorageConfiguration.js";
import mupdf from "mupdf";


const DPI_FOR_WEB_IMAGE = 70;

/**
 * This function load a PDF page from the blob storage and return a preview image of the page.
 * DPI is query params must 70 ( for web display in select usecase page )
 * @param request 
 * @param context 
 * @returns 
 */
export async function projectsImage(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`Project get image for selection preview : ${context.invocationId}`);

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
    
    const projectId:string = request.params['projectId'];
    const pdfPageName:string = request.params['pdfPageName']; // "page_00000021.pdf"

    const dpi:number = request.query.get('dpi') ? parseInt(request.query.get('dpi') as string) : DPI_FOR_WEB_IMAGE;
    if ( dpi !== DPI_FOR_WEB_IMAGE ) {
        return {
            status: 400,
            jsonBody: {
                "message": `DPI must be ${DPI_FOR_WEB_IMAGE}, but got ${dpi}.`
            },
            headers: {
                'Content-Type': 'application/json'
            }
        }
    }

    const containerClient: ContainerClient = getBlobStorageClient().getContainerClient(process.env.blobContainerName as string);
    const blobPrefix = `pdf/${projectId}/`;

    const buffer:Buffer = await containerClient.getBlockBlobClient(`${blobPrefix}${pdfPageName}`).downloadToBuffer(); 
    if ( buffer.byteLength === 0 ) {
        return {
            status: 500,
            jsonBody: {
                "message": `Page ${pdfPageName} not found in project ${projectId}.`
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
    const b64 = Buffer.from(pngImage).toString('base64');

    try {
        return {
            status: 200,
            jsonBody: {
                "name": pdfPageName,
                "b64": b64
            },
            headers: {
                'Content-Type': 'application/json'
            }
        }

    } catch ( e ) {
        return {
            status: 500,
            jsonBody: {
                "message": `An error occurred while processing the request : ${e}`
            },
            headers: {
                'Content-Type': 'application/json'
            }
        }
    }
 
};

app.http('projects-image-preview', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'projects/{projectId}/image/{pdfPageName}',
    handler: projectsImage
});

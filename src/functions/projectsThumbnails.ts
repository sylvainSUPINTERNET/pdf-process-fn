import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { verifyTokenMain } from "../services/auth/verifyToken.js";
import { getProjectThumbnails } from "../services/project/thumbnails.js";

export async function projectsThumbnails(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`Processing project list thumbnails : ${context.invocationId}`);

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
    const continuationToken = request.query.get('continuationToken') || "";
    const maxPageSize = 20;
    const dpiThumbnail = process.env.ThumbnailDpi as unknown as number || 30;

        try {
            const {continuationToken:nextContinuationToken, images} : { continuationToken: string, images: {name: string, b64:string}[] } = await getProjectThumbnails(projectId, continuationToken, maxPageSize, dpiThumbnail, context)
            return {
                status: 200,
                jsonBody: {
                    continuationToken: nextContinuationToken,
                    images
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
                headers:{
                    'Content-Type': 'application/json'
                }
        }
    }
};

app.http('projects-thumbnails', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'projects/{projectId}/thumbnails',
    handler: projectsThumbnails
});

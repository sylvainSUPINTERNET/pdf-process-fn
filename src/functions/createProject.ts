import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions"; 
import { MongoClient } from 'mongodb';
import { isValidProjectEstimatePayload } from "../services/payload/checkProject.js";
import { Project } from "../types/Project.js";
import { prepareDataFromPayload, uploadAndSplit } from "../services/project/project.js";
import { verifyTokenMain } from "../services/auth/verifyToken.js";


const WEBHOOK_HEADER_SECRET:string = "X-Webhook-Secret"

async function notifyWebhook(sub:string, projectId:string, status: "COMPLETED" | "FAILED", context: InvocationContext): Promise<void> {

    const webhookUrl = process.env.WebhookUrl as string;
    const webhookSecret = process.env.WebhookSecret as string;

    const resp = await fetch(`${webhookUrl}`, {
        method: "POST",
        headers: {
            'Content-Type': 'application/json',
            [process.env.WEBHOOK_HEADER_SECRET as string]: webhookSecret
        },
        body: JSON.stringify({
            "user": sub,
            "projectId": projectId,
            "status" : status
        })
    });

    if ( !resp.ok ) {
        const data = await resp.json();
        context.error(`Error while notifying webhook for project ${projectId}: ${resp.status} - ${data}`);
    }
}


/**
 * This function upload the PDF file as pages and create a new project
 */
export async function createProject(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`Processing request to create project : ${context.invocationId}`);
    
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


    // Payload Data
    const body = await request.formData();
    if ( !body.get('files') || body.get('files') === null ) {
        context.error(`Files are required in the request body.`);
        return {
            status: 400,
            body: JSON.stringify({
                "message": "Files are required"
            }),
            headers: {
                'Content-Type': 'application/json'
            }
        }
    }
    const filePdf = body.get('files') as unknown as File;
    const pdfFileBuffer:ArrayBuffer = await filePdf.arrayBuffer();

    if ( !body.get('projectEstimate') || body.get('projectEstimate') === null ) {
        return {
            status: 400,
            body: JSON.stringify({
                "message": "Project estimate field is required"
            }),
            headers: {
                'Content-Type': 'application/json'
            }
        }
    } else {
        let errorFields = isValidProjectEstimatePayload(body.get('projectEstimate') as any, context);
        if ( errorFields.length > 0 ) {
            return {
                status: 400,
                body: JSON.stringify({
                    "message": `Project estimate field must be valid and contains : ${errorFields.join(', ')}`
                }),
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        }
    }

    const project:Project = await prepareDataFromPayload(body.get('projectEstimate') as any, creator, context);

    /**
     * Process : PDF => X page PDF ( upload storage azure )
     */
    let totalUploaded;
    try {
        const {totalPages} = await uploadAndSplit(project, context, pdfFileBuffer);
        totalUploaded = totalPages;
        context.log(`Project PDF file processed with success for ${project.projectId}`);
    } catch ( e ) {
        await notifyWebhook(creator, project.projectId, 'FAILED', context);
        context.error(`Error while processing PDF file for project ${project.projectId}: ${e}`);
        return {
            status: 500,
            body: JSON.stringify({
                "message": `Error while processing PDF file: ${e.message}`
            }),
            headers: {
                'Content-Type': 'application/json'
            }
        };
    }

    /**
     * Save Project
     */
    const client:MongoClient = new MongoClient(process.env.MongoDBConnectionString as string);
    await client.connect();
    const db = client.db(process.env.DbName as string);
    const collection = db.collection(process.env.ProjectCollectionName as string);
    const result = await collection.insertOne(project);


    context.log(`Project PDF file uploaded and project saved with success : ${project.projectId}`);

    if ( client ) {
        try {
            await client.close(true);
        } catch ( e ) {
            context.error(`Error while closing DB Client: ${e}`);
            await notifyWebhook(creator, project.projectId, 'FAILED', context);
        }
    }


    await notifyWebhook(creator, project.projectId, 'COMPLETED', context);

    return { 
        "status": 200,
        "body": JSON.stringify({
            "totalPages": totalUploaded,
            "projectId": project.projectId,
        }),
        "headers": {
            'Content-Type': 'application/json'
        }
    }
};

app.http('projects', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: createProject
});

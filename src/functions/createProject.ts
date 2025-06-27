import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions"; 
import { MongoClient } from 'mongodb';
import { isValidProjectEstimatePayload } from "../services/payload/checkProject.js";
import { Project } from "../types/Project.js";
import { prepareDataFromPayload, uploadAndSplit } from "../services/project/project.js";


export async function createProject(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    
    // TODO => auth here
    let creator = "sub";

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
        }
    }

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

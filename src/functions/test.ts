import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

export async function test(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`TEST"${request.url}"`);

    const name = request.query.get('name') || await request.text() || 'world';

    return { body: `TEST, ${name}!` };
};

app.http('test', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: test
});

import { InvocationContext } from "@azure/functions";
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

async function getSigningKey(client: jwksClient.JwksClient, kid: string, context: InvocationContext): Promise<string> {
    return new Promise((resolve, reject) => {
        client.getSigningKey(kid, (err, key) => {
            if (err) {
                return reject(err);
            }
            const signingKey = key.getPublicKey();
            resolve(signingKey);
        });
    });
}

async function verifyToken(token: string, signingKey: string, audience: string): Promise<jwt.JwtPayload> {
    return new Promise((resolve, reject) => {
        jwt.verify(
            token,
            signingKey,
            {
                audience: audience,
                algorithms: ['RS256']
            },
            (err, decoded) => {
                if (err) {
                    reject(new Error(`JWT verification failed: ${err.message}`));
                } else {
                    resolve(decoded as jwt.JwtPayload);
                }
            }
        );
    });
}

export async function verifyTokenMain(authorizationHeader: any, context: InvocationContext): Promise<{error: boolean, sub: null | string}> {
    try {
        const audience = process.env.AudienceAuth0 as string;
        const url = process.env.JwksAuth0 as string;

        if (!authorizationHeader || typeof authorizationHeader !== 'string') {
            context.debug('No authorization header provided');
            return { error: true, sub: null };
        }

        const tokenUnverified = authorizationHeader.split(" ")[1];
        
        if (!tokenUnverified) {
            context.debug('No token found in authorization header');
            return { error: true, sub: null };
        }

        // Décoder le header du JWT pour récupérer le KID
        const decoded = jwt.decode(tokenUnverified, { complete: true });
        if (!decoded || !decoded.header || !decoded.header.kid) {
            context.debug('Invalid JWT: missing kid in header');
            return { error: true, sub: null };
        }

        const client = jwksClient({
            jwksUri: url,
            requestHeaders: {},
            timeout: 30000
        });

        // Récupérer la clé de signature
        const signingKey = await getSigningKey(client, decoded.header.kid, context);
        
        // Vérifier le token
        const payload = await verifyToken(tokenUnverified, signingKey, audience);
        
        if (!payload.sub) {
            context.debug('No sub claim found in token');
            return { error: true, sub: null };
        }

        context.debug(`Token verified successfully for sub: ${payload.sub}`);
        return { error: false, sub: payload.sub };
        
    } catch (error) {
        context.debug(`Token verification failed: ${error.message}`);
        return { error: true, sub: null };
    }
}
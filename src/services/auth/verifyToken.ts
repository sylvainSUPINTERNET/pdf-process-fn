import { InvocationContext } from "@azure/functions";
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';



async function verifyAsync(jwt,token,key, audience): Promise<jwt.JwtPayload>{
   if(!token) return {};
   return new Promise((resolve,reject) =>
      jwt.verify(
        token,
        key,
        {
            audience: audience,
            algorithms: ['RS256']
        },
        (err,decoded) => err ? reject({error: `${err}`}) : 
                                                  resolve(decoded))
   );
}

export async function verifyToken(authorizationHeader: any, context: InvocationContext): Promise<{error: boolean, sub: null | string}> {
    try {
        const audience = process.env.AudienceAuth0 as string;
        const url = process.env.JwksAuth0 as string;

        const tokenUnverified = authorizationHeader.split(" ")[1];
            
        const client = jwksClient({
            jwksUri: url,
            requestHeaders: {},
            timeout: 30000
        });
        
        const getKey = (header, callback) => {
            client.getSigningKey(header.kid, (err, key) => {
                if (err) {
                    return callback(err);
                }
                const signingKey = key.getPublicKey()
                callback(null, signingKey);
            });
        };

        const { sub } = await verifyAsync(jwt, tokenUnverified, getKey, audience) as jwt.JwtPayload;
        if (!sub) {
            return {
                error: true,
                sub: null
            }
        } else {
            return {
                error: false,
                sub
            }
        }
        
    } catch (error) {
        return {
            error: true,
            sub: null
        }
    }
}





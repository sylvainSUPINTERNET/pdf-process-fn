# Azure Function PDF


# Start

```` bash
npm run start

````


## Configuration


`local.settings.json`

Note that JWKS / Audience depends on where your token is from.


``` bash
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "MongoDBConnectionString": "",
    "DbName": "",
    "ProjectCollectionName": "projects",
    "ThumbnailDpi": 10,
    "blobContainerName": "pdf-images-thumbnails",
    "AzureBlobStorageConnString":"",
    "JwksAuth0": "https://<well-known>/.well-known/jwks.json",
    "AudienceAuth0": "https://<api_url>/api",
    "WebhookSecret": "",
    "WebhookUrl": ""
  },
  "Host": {
    "CORS": "http://localhost:3000",
    "CORSCredentials": true
  },
  "ConnectionStrings": {}
}

```

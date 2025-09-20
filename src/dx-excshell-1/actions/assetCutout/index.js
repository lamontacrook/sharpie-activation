/*
* <license header>
*/

/**
 * This action uses the Adobe Photoshop API to remove backgrounds from images
 * 
 * Required parameters:
 * - imageUrl: URL of the image to process
 * - outputFormat: format of the output image (default: 'png')
 * 
 * The action requires:
 * - SERVICE_API_KEY: Adobe API key for authentication
 * - Authorization: Bearer token for API access
 */


const fetch = require('node-fetch')
const { Core } = require('@adobe/aio-sdk')
const { errorResponse, getBearerToken, stringParameters, checkMissingRequestInputs, smartImageFileName } = require('../utils');
const openwhisk = require('openwhisk');

async function invoke(name, params, apiKey, logger) {

  const {fileName, mimeType} = await smartImageFileName(params.imageUrl);
  logger.info('Uploading image to S3: ', params);
  const ow = openwhisk({
    apihost: params.apihost,
    api_key: params.api_key, // From your .env: AIO_runtime_auth
    namespace: '1394679-276yellowhorse-stage' // From your .env: AIO_runtime_namespace
  });
  try {
    const result = await ow.actions.invoke({
      name: 'dx-excshell-1/upload-url-to-s3',
      params: {
        url: params.imageUrl,
        bucket: "firefly-upload",
        key: `uploads/${Date.now()}-${fileName}`,
        region: params.region,
        public: true,
        contentType: mimeType,
        cacheSeconds: 3600,
        sse: true,
        timeoutMs: 60000,
        AWS_ACCESS_KEY_ID: params.AWS_ACCESS_KEY_ID,
        AWS_SECRET_ACCESS_KEY: params.AWS_SECRET_ACCESS_KEY
      },
      blocking: true // Wait for result
    });

    console.log('Action result:', result.response.result);
    return result.response.result;
  } catch (error) {
    console.error('Action failed:', error);
    throw error;
  }
}

async function saveAsset(name, params, logger) {
  const {fileName, mimeType} = await smartImageFileName(params.imageUrl);
  logger.info('Uploading image to S3: ', params);
  const ow = openwhisk({
    apihost: params.AIO_RT_APIHOST,
    api_key: params.AIO_RT_AUTH, // From your .env: AIO_runtime_auth
    namespace: params.AIO_RT_NAMESPACE // From your .env: AIO_runtime_namespace
  });

  params.fileName = fileName;
  params.mimeType = mimeType;
  const result = await ow.actions.invoke({name, params: params, blocking: true});
  logger.info('Successfully invoked image-writer action ', result.response.result.body.publicUrl);
  return result.response.result.body.publicUrl;
}

// main function that will be executed by Adobe I/O Runtime
async function main(params) {
  // create a Logger
  const logger = Core.Logger('main', { level: params.LOG_LEVEL || 'info' })

  try {
    // 'info' is the default level if not set
    logger.info('Calling the main action')

    // log parameters, only if params.LOG_LEVEL === 'debug'
    // logger.debug(stringParameters(params));
    // logger.info('--------------------------------');
    // logger.info(params);

    // check for missing request input parameters and headers
    const requiredParams = ['imageUrl'];

    const requiredHeaders = ['Authorization', 'x-api-key']
    const errorMessage = checkMissingRequestInputs(params, requiredParams, requiredHeaders)
    if (errorMessage) {
      // return and log client errors
      return errorResponse(400, errorMessage, logger)
    }

    // extract the user Bearer token from the Authorization header
    const token = getBearerToken(params);
    const apiKey = params['__ow_headers']['x-api-key'];
    // logger.info('API Key: ', apiKey);
    // get API key from environment
    // const apiKey = params.SERVICE_API_KEY || process.env.SERVICE_API_KEY
    if (!apiKey) {
      return errorResponse(400, 'SERVICE_API_KEY is required', logger)
    }

    let s3Url;
    try {
      // const result = await invoke('upload-url-to-s3', params, apiKey, logger);
      //const result = await saveAsset('dx-excshell-1/image-writer', params, logger);
      // logger.info('Successfully invoked upload-url-to-s3 action ', result);
     
      s3Url = params.imageUrl; //JSON.parse(result.body).publicUrl;
      // return {
      //   statusCode: 200,
      //   body: {
      //     success: true,
      //     result: result,
      //     message: 'Successfully processed upload request'
      //   }
      // };
    } catch (invokeError) {
      logger.error('Error invoking upload-url-to-s3 action:', invokeError);
      return errorResponse(500, `Failed to invoke upload action: ${invokeError.message}`, logger);
    }
    ///----

    // Adobe Photoshop API endpoint for background removal
    const apiEndpoint = 'https://image.adobe.io/v2/remove-background'

    const requestBody = {
      "image": {
        "source": {
          "url": s3Url
        }
      },
      "mode": "cutout",
      "output": {
        "mediaType": "image/png"
      },
      "trim": true,
      "colorDecontamination": 1
    };

    logger.info('Making request to Photoshop API for background removal')
    logger.debug(`Request body: ${JSON.stringify(requestBody)}`)

    // make the API call to Photoshop API
    const res = await fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(requestBody)
    })

    if (!res.ok) {
      const errorText = await res.text()
      logger.error(`Photoshop API error: ${res.status} - ${errorText}`)
      throw new Error(`Photoshop API request failed with status code ${res.status}: ${errorText}`)
    }

    const content = await res.json()
    logger.info('Successfully processed image background removal')

    const response = {
      statusCode: 200,
      body: {
        success: true,
        originalImage: params.imageUrl,
        processedImage: content.output?.href || content.href,
        message: 'Background successfully removed from image',
        details: content
      }
    }

    // log the response status code
    logger.info(`${response.statusCode}: successful request`)
    return response
  } catch (error) {
    // log any server errors
    logger.error(error)
    // return with 500
    return errorResponse(500, 'server error', logger)
  }
}

exports.main = main

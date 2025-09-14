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
const { errorResponse, getBearerToken, stringParameters, checkMissingRequestInputs } = require('../utils');
const openwhisk = require('openwhisk');

async function invoke(name, params) {

  // const p = {"url":"https://pre-signed-firefly-prod.s3-accelerate.amazonaws.com/images/b0d1ad3a-5125-4ba0-b298-5a6994ebe3e6?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIARDA3TX66MGQ4XHXQ%2F20250914%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20250914T210312Z&X-Amz-Expires=3600&X-Amz-SignedHeaders=host&X-Amz-Signature=4a7cb4bc6e0600f2347003224660eb854e6ca8e0653f1354e4a063108abf4d5c",
  //   "bucket":"firefly-upload",
  //   "key": "uploads/lamontcrook-cutout.png",
  //   "presignSeconds": 3600}

  
  const ow = openwhisk({ apihost, api_key, namespace }); // uses App Builder env/context
  const res = await ow.actions.invoke({
    name, params, blocking: true, result: true
  });
  return res; // { success payload }
}

// main function that will be executed by Adobe I/O Runtime
async function main(params) {
  // create a Logger
  const logger = Core.Logger('main', { level: params.LOG_LEVEL || 'info' })

  try {
    // 'info' is the default level if not set
    logger.info('Calling the main action')

    // log parameters, only if params.LOG_LEVEL === 'debug'
    logger.debug(stringParameters(params));
    logger.info('--------------------------------');
    logger.info(params);

    // check for missing request input parameters and headers
    const requiredParams = ['imageUrl'];

    const s3 = invoke('upload-url-to-s3', params);
    return s3;

    const requiredHeaders = ['Authorization', 'x-api-key']
    const errorMessage = checkMissingRequestInputs(params, requiredParams, requiredHeaders)
    if (errorMessage) {
      // return and log client errors
      return errorResponse(400, errorMessage, logger)
    }

    // extract the user Bearer token from the Authorization header
    const token = getBearerToken(params);
    const apiKey = params['__ow_headers']['x-api-key'];
    logger.info('API Key: ', apiKey);
    // get API key from environment
    // const apiKey = params.SERVICE_API_KEY || process.env.SERVICE_API_KEY
    if (!apiKey) {
      return errorResponse(400, 'SERVICE_API_KEY is required', logger)
    }

    // Adobe Photoshop API endpoint for background removal
    const apiEndpoint = 'https://image.adobe.io/v2/remove-background'

    const requestBody = {
      "image": {
        "source": {
          "url": params.imageUrl
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

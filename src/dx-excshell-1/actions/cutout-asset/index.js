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

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
async function getStatus(jobId, apiKey, params, logger) {
  logger.info('Getting status for job: ', jobId);
  logger.info('API Key: ', apiKey);

  // const { fileName, mimeType } = await smartImageFileName(params.imageUrl);

  const ow = openwhisk({
    apihost: params.AIO_RT_APIHOST,
    api_key: params.AIO_RT_AUTH, // From your .env: AIO_runtime_auth
    namespace: params.AIO_RT_NAMESPACE // From your .env: AIO_runtime_namespace
  });

  // params.fileName = fileName;
  // params.mimeType = mimeType;
  params.jobId = jobId;

  let result;
  do {
    await wait(5000);
    result = await ow.actions.invoke({name: 'dx-excshell-1/get-status', params: params, blocking: true });
    logger.info('Status: ', result.response.result.body.status);
  } while (result.response.result.body.status === 'running');//result.response.result.status !== 'completed') 
  

  // new Promise(resolve => setTimeout(ow.actions.invoke, 5000), {name: 'dx-excshell-1/get-status', params: params, blocking: true });
  logger.info('Successfully invoked get status action ', result.response.result);
  return result.response;
}

// main function that will be executed by Adobe I/O Runtime
async function main(params) {
  // create a Logger
  const logger = Core.Logger('main', { level: params.LOG_LEVEL || 'info' })

  try {
    // 'info' is the default level if not set
    logger.info('Calling the main action');
  
    const requiredParams = ['imageUrl', 'x-api-key'];
    const requiredHeaders = ['Authorization']
    const errorMessage = checkMissingRequestInputs(params, requiredParams, requiredHeaders)
    if (errorMessage) {
      // return and log client errors
      return errorResponse(400, errorMessage, logger)
    }

    // extract the user Bearer token from the Authorization header
    const token = getBearerToken(params);
    const apiKey = params['x-api-key'];
   
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

    const { jobId } = content;
    const status = await getStatus(jobId, apiKey, params, logger);

    const response = {
      statusCode: 200,
      body: status
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

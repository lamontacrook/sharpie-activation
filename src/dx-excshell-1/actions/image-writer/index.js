/*
* <license header>
*/

/**
 * This action downloads an image from a URL and writes it using Adobe I/O Files
 * 
 * Required parameters:
 * - imageUrl: URL of the image to download and write
 * - aio_namespace: Adobe I/O Runtime namespace
 * - aio_auth: Adobe I/O Runtime auth token
 * 
 * Optional parameters:
 * - filePath: Custom file path (defaults to 'images/{timestamp}-{filename}')
 * - public: Whether to make the file publicly accessible (defaults to true)
 */

const fetch = require('node-fetch')
const { Core } = require('@adobe/aio-sdk')
const { errorResponse, getBearerToken, stringParameters, checkMissingRequestInputs, smartImageFileName } = require('../utils');
const filesLib = require('@adobe/aio-lib-files');

// main function that will be executed by Adobe I/O Runtime
async function main(params) {
  // create a Logger
  const logger = Core.Logger('main', { level: params.LOG_LEVEL || 'info' })

  try {
    logger.info('Starting image writer action with Adobe I/O Files')
    logger.debug(stringParameters(params))

    // check for missing request input parameters
    const requiredParams = ['imageUrl', 'aio_namespace', 'aio_auth'];
    const requiredHeaders = ['Authorization']
    const errorMessage = checkMissingRequestInputs(params, requiredParams, requiredHeaders)
    if (errorMessage) {
      return errorResponse(400, errorMessage, logger)
    }

    // Initialize Adobe I/O FilesC
    const files = await filesLib.init({ 
      ow: { 
        namespace: params.aio_namespace, 
        auth: params.aio_auth 
      } 
    });

    logger.info('Params: ', params);
    // Extract filename and MIME type from URL
    const { fileName, mimeType } = await smartImageFileName(params.imageUrl);
    logger.info(`Processing image: ${fileName} (${mimeType})`)

    // Generate file path
    const timestamp = Date.now();
    const defaultPath = `public/${timestamp}-${fileName}`;
    const filePath = params.filePath || defaultPath;

    logger.info(`Downloading image from: ${params.imageUrl}`)

    // Download the image
    const response = await fetch(params.imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
    }

    // Get the image data as buffer
    const imageBuffer = await response.buffer();
    logger.info(`Downloaded ${imageBuffer.length} bytes`)

    // Write the image to Adobe I/O Files
    logger.info(`Writing image to: ${filePath}`)
    await files.write(filePath, imageBuffer);

    // Get file properties to return URL and metadata
    const fileProps = await files.getProperties(filePath);
    logger.info('File written successfully:', fileProps)

    // Generate public URL if requested (default true)
    let publicUrl = null;
    if (params.public !== false) {
      try {
        // Try to generate a public URL
        publicUrl = fileProps.url || `https://your-runtime-url/files/${filePath}`;
      } catch (urlError) {
        logger.warn('Could not generate public URL:', urlError.message);
      }
    }

    const result = {
      statusCode: 200,
      body: {
        success: true,
        originalUrl: params.imageUrl,
        fileName: fileName,
        mimeType: mimeType,
        filePath: filePath,
        fileSize: imageBuffer.length,
        fileProperties: fileProps,
        publicUrl: fileProps.url,
        metadata: {
          timestamp: timestamp,
          contentType: mimeType,
          downloadedAt: new Date().toISOString()
        },
        message: 'Image successfully written to Adobe I/O Files'
      }
    }

    logger.info(`Image written successfully to: ${fileProps.url}`)
    return result

  } catch (error) {
    logger.error('Error in image writer:', error)
    return errorResponse(500, `Image writer error: ${error.message}`, logger)
  }
}

exports.main = main

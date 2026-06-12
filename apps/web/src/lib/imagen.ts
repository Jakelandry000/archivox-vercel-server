import { PredictionServiceClient } from '@google-cloud/aiplatform'

interface RenderImageInput {
  imageBase64: string
  prompt: string
  projectId: string
}

const LOCATION = 'us-central1'
const PUBLISHER = 'google'
const MODEL = 'imagen-3.0-edit-001'

const ARCHITECTURE_SUFFIX = [
  'photorealistic architectural rendering',
  'professional portfolio quality',
  'add trees, grass, landscape context',
  'natural lighting, golden hour',
  'preserve all geometry and structural elements exactly',
  'high resolution, sharp details',
].join(', ')

export async function renderImage(input: RenderImageInput): Promise<string> {
  const credentials = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON
    ? JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON)
    : undefined

  const client = new PredictionServiceClient({
    apiEndpoint: `${LOCATION}-aiplatform.googleapis.com`,
    credentials,
  })

  const endpoint = `projects/${input.projectId}/locations/${LOCATION}/publishers/${PUBLISHER}/models/${MODEL}`
  const fullPrompt = `${input.prompt}, ${ARCHITECTURE_SUFFIX}`

  const [response] = await client.predict({
    endpoint,
    instances: [
      {
        structValue: {
          fields: {
            prompt: { stringValue: fullPrompt },
            referenceImages: {
              listValue: {
                values: [
                  {
                    structValue: {
                      fields: {
                        referenceType: { stringValue: 'REFERENCE_TYPE_STYLE' },
                        referenceImage: {
                          structValue: {
                            fields: {
                              bytesBase64Encoded: { stringValue: input.imageBase64 },
                            },
                          },
                        },
                      },
                    },
                  },
                ],
              },
            },
          },
        },
      },
    ],
    parameters: {
      structValue: {
        fields: {
          sampleCount: { numberValue: 1 },
          aspectRatio: { stringValue: '16:9' },
        },
      },
    },
  })

  const base64 = (response.predictions?.[0] as any)?.bytesBase64Encoded
  if (!base64) throw new Error('Imagen returned no image data')

  return base64 as string
}

import { prisma } from './client'

interface CreateRenderInput {
  originalUrl: string
  prompt: string
  projectId: string | null
}

export async function createRender(input: CreateRenderInput) {
  return prisma.render.create({ data: input })
}

export async function updateRender(
  id: string,
  data: { status: string; renderedUrl?: string }
) {
  return prisma.render.update({ where: { id }, data })
}

export async function getRendersByProject(projectId: string) {
  return prisma.render.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
  })
}

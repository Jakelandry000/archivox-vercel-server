import { prisma } from './client'

interface CreateReelNoteInput {
  url: string
  userNote?: string | null
  assemblyJobId: string
  telegramChatId: string
}

interface UpdateReelNoteInput {
  summary?: string
  applicability?: string
  archivoxUseCase?: string | null
  status?: string
}

export async function createReelNote(input: CreateReelNoteInput) {
  return prisma.reelNote.create({
    data: {
      url: input.url,
      userNote: input.userNote ?? null,
      assemblyJobId: input.assemblyJobId,
      telegramChatId: input.telegramChatId,
      status: 'pending',
    },
  })
}

export async function getReelNoteByJobId(jobId: string) {
  return prisma.reelNote.findUnique({ where: { assemblyJobId: jobId } })
}

export async function updateReelNote(id: string, data: UpdateReelNoteInput) {
  return prisma.reelNote.update({ where: { id }, data })
}

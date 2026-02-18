import { useCallback, useMemo } from 'react'
import { analyzeImage, analyzeImageViaClaudeCode } from '../lib/claude'
import * as api from '../lib/api'
import type { DroppedFile, ImageAnalysis } from '../types'
import type { ImageAnalysisStatus } from '../components/dropzone/FileDropZone'

interface UseImageAnalysisParams {
  useClaudeCode: boolean
  apiKey: string
  addFiles: (files: DroppedFile[]) => void
  addImageAnalysis: (analysis: Omit<ImageAnalysis, 'id' | 'timestamp'>) => string
  updateImageAnalysis: (id: string, update: Partial<ImageAnalysis>) => void
  updateFile: (id: string, update: Partial<DroppedFile>) => void
  imageAnalyses: ImageAnalysis[]
}

export function useImageAnalysis({
  useClaudeCode,
  apiKey,
  addFiles,
  addImageAnalysis,
  updateImageAnalysis,
  updateFile,
  imageAnalyses,
}: UseImageAnalysisParams) {
  const handleFilesAdd = useCallback(async (files: DroppedFile[]) => {
    addFiles(files)

    if (!useClaudeCode && !apiKey) return

    for (const file of files) {
      const analysisId = addImageAnalysis({
        fileId: file.id,
        fileName: file.name,
        description: '',
        status: 'analyzing',
      })

      const analyzePromise = useClaudeCode
        ? analyzeImageViaClaudeCode(file)
        : analyzeImage(file, apiKey)

      analyzePromise
        .then((description) => {
          updateImageAnalysis(analysisId, { description, status: 'complete' })
          updateFile(file.id, { description })
          api.updateImageDescription(file.id, description).catch(() => {})
        })
        .catch((err) => {
          console.error('Image analysis failed:', err)
          updateImageAnalysis(analysisId, { status: 'error', error: err.message })
        })
    }
  }, [addFiles, addImageAnalysis, updateImageAnalysis, updateFile, apiKey, useClaudeCode])

  const analysisStatuses: ImageAnalysisStatus[] = useMemo(() =>
    imageAnalyses.map(a => ({
      fileId: a.fileId,
      status: a.status,
      description: a.description,
    })),
    [imageAnalyses]
  )

  return { handleFilesAdd, analysisStatuses }
}

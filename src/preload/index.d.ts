import type { PcAgentApi } from '../shared/contracts'

declare global {
  interface Window {
    pcAgent: PcAgentApi
  }
}

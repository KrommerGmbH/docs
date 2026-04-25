import { defineComponent } from 'vue'
import { useRoute } from 'vue-router'
import { InMemoryDataAdapter } from '@engine/data/data-adapter'
import { RepositoryFactory } from '@engine/data/repository-factory'
import { Criteria } from '@engine/data/criteria'
import { seedDefaultData } from '@engine/data/seed'
import { getAutoRead, setAutoRead, setTtsOptions } from '@/app/service/tts.service'
import { useUserContextStore } from '@/app/store/user-context.store'
import template from './cmh-settings-detail.html?raw'
import './cmh-settings-detail.scss'

// DAL 초기화
const _adapter = new InMemoryDataAdapter()
seedDefaultData(_adapter)
const _repoFactory = new RepositoryFactory(_adapter)

export default defineComponent({
  name: 'cmh-settings-detail',
  template,

  data() {
    return {
      isLoading: false,
      section: 'general' as string,

      // TTS
      ttsModels: [] as any[],
      selectedTtsModelId: '' as string,
      ttsRate: 1.0,
      ttsAutoRead: false,

      // STT
      sttModels: [] as any[],
      selectedSttModelId: '' as string,
      sttStatus: 'idle' as string,

      // Chat generation defaults
      chatTemperature: 0.7,
      chatMaxTokens: 2048,
    }
  },

  computed: {
    sttStatusText(): string {
      const map: Record<string, string> = {
        'idle': this.$t('cmh-settings.detail.stt.status.idle'),
        'loading-model': this.$t('cmh-settings.detail.stt.status.loadingModel'),
        'ready': this.$t('cmh-settings.detail.stt.status.ready'),
        'recording': this.$t('cmh-settings.detail.stt.status.recording'),
        'transcribing': this.$t('cmh-settings.detail.stt.status.transcribing'),
        'error': this.$t('cmh-settings.detail.stt.status.error'),
      }
      return map[this.sttStatus] ?? this.sttStatus
    },
  },

  created() {
    this.createdComponent()
  },

  methods: {
    async createdComponent(): Promise<void> {
      const route = useRoute()
      this.section = (route.params.section as string) ?? 'general'
      this.ttsAutoRead = getAutoRead()
      const userCtx = useUserContextStore()
      if (!userCtx.isInitialized) userCtx.initialize()
      this.chatTemperature = userCtx.settings.chatTemperature ?? 0.7
      this.chatMaxTokens = userCtx.settings.chatMaxTokens ?? 2048
      await this.loadModels()
    },

    async loadModels(): Promise<void> {
      this.isLoading = true
      try {
        // TTS / STT static options as models DAL is deleted
        this.ttsModels = [
          { id: 'edge-tts', name: 'Edge TTS', type: 'tts', isDefault: true }
        ]
        this.sttModels = [
          { id: 'whisper-web', name: 'Whisper Web', type: 'stt', isDefault: true }
        ]

        // 기본 선택
        if (this.ttsModels.length > 0) this.selectedTtsModelId = this.ttsModels[0].id
        if (this.sttModels.length > 0) this.selectedSttModelId = this.sttModels[0].id
      } catch (err) {
        console.error('Failed to init models:', err)
      } finally {
        this.isLoading = false
      }
    },

    // ─────────────────────────────────────────────────────────────
    // TTS Methods
    // ─────────────────────────────────────────────────────────────
    navigateBack(): void {
      void this.$router.push({ name: 'cmh.settings.list' })
    },

    selectTtsModel(modelId: string): void {
      this.selectedTtsModelId = modelId
      this.onChangeTtsModel()
    },

    onChangeTtsModel() {
      // not functional anymore
    },

    onChangeTtsRate() {
      setTtsOptions({ rate: this.ttsRate })
    },

    onTtsRateChange(event: Event): void {
      const val = Number((event.target as HTMLInputElement).value)
      if (Number.isFinite(val)) {
        this.ttsRate = Math.min(2, Math.max(0.5, val))
        this.onChangeTtsRate()
      }
    },

    onChangeTtsAutoRead(val: boolean) {
      this.ttsAutoRead = val
      setAutoRead(val)
    },

    toggleAutoRead(): void {
      this.onChangeTtsAutoRead(!this.ttsAutoRead)
    },

    async onTestTts() {
      alert('TTS Test')
    },

    // ─────────────────────────────────────────────────────────────
    // Web STT (Browser-based) Methods
    // ─────────────────────────────────────────────────────────────
    selectSttModel(modelId: string): void {
      this.selectedSttModelId = modelId
    },

    async onStartSttTest() {
      alert('STT Test')
    },

    onChatTemperatureInput(event: Event): void {
      const val = Number((event.target as HTMLInputElement).value)
      if (!Number.isFinite(val)) return
      const next = Math.min(2, Math.max(0, Number(val.toFixed(2))))
      this.chatTemperature = next
      useUserContextStore().updateSettings({ chatTemperature: next })
    },

    onChatMaxTokensInput(event: Event): void {
      const val = Number((event.target as HTMLInputElement).value)
      if (!Number.isFinite(val)) return
      const next = Math.min(4096, Math.max(64, Math.round(val)))
      this.chatMaxTokens = next
      useUserContextStore().updateSettings({ chatMaxTokens: next })
    },
  },
})

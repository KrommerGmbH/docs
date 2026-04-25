import { defineComponent } from 'vue'
import { useRepositoryFactory } from '../../../../app/composables/useRepositoryFactory'
import { useChatStore } from '../../../../app/store/chat.store'
import { MixinFactory } from '@core/factory/mixin.factory'
import { isUsableApiKey } from '../../../../../shared/security/is-usable-api-key'
import template from './cmh-provider-detail.html?raw'
import './cmh-provider-detail.scss'
import '@engine/data/entity/llm/llm-provider.definition'

export default defineComponent({
  name: 'cmh-provider-detail',
  template,

  mixins: [
    MixinFactory.getByName('notification'),
  ],

  data() {
    const { repositoryFactory } = useRepositoryFactory()
    return {
      isLoading: false,
      isSaving: false,
      apiKeyReadonly: true,
      provider: null as Record<string, unknown> | null,
      repositoryFactory,
      form: {
        name: '',
        description: '',
        type: 'local-gguf',
        apiKey: '',
        baseUrl: '',
        isActive: true,
        priority: 10,
      },
    }
  },

  computed: {
    providerId(): string { return this.$route.params.id as string },
  },

  created() { void this.createdComponent() },

  methods: {
    async createdComponent(): Promise<void> {
      await this.loadProvider()
    },

    async loadProvider(): Promise<void> {
      if (!this.providerId) return
      this.isLoading = true
      try {
        const repo = this.repositoryFactory.create('cmh_llm_provider')
        const result = await repo.search({ limit: 500 })
        this.provider = result.data.find((p: any) => p.id === this.providerId) ?? null
        if (this.provider) {
          this.form.name = (this.provider.name as string) || ''
          this.form.description = (this.provider.description as string) || ''
          this.form.type = (this.provider.type as string) || 'local-gguf'
          const existingApiKey = (this.provider.apiKey as string) || ''
          this.form.apiKey = existingApiKey.startsWith('keychain://') ? '' : existingApiKey
          this.form.baseUrl = (this.provider.baseUrl as string) || ''
          this.form.isActive = this.provider.isActive as boolean ?? true
          this.form.priority = (this.provider.priority as number) || 10
          // 브라우저 비밀번호 매니저 자동 채움 방지
          if (!existingApiKey || existingApiKey.startsWith('keychain://')) {
            this.form.apiKey = ''
          }
          this.apiKeyReadonly = true
        } else {
          this.form.apiKey = ''
          this.apiKeyReadonly = true
        }
      } finally {
        this.isLoading = false
      }
    },

    async onSave(): Promise<void> {
      this.isSaving = true
      try {
        const nowIso = new Date().toISOString()
        const basePayload = {
          id: this.providerId,
          ...this.form,
          updatedAt: nowIso,
          ...(!this.provider ? { createdAt: nowIso } : {}),
        }

        const shouldSaveCloudApiKey = this.form.type === 'cloud-api' && isUsableApiKey(this.form.apiKey)

        // 1) 우선 secure-save 시도 (keychain 저장)
        // 2) 실패 시 DAL save로 폴백하여 사용자 입력이 유실되지 않도록 한다.
        try {
          const secureRes = await fetch('/api/providers/secure-save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(basePayload),
            signal: AbortSignal.timeout(2_000),
          })

          if (!secureRes.ok) {
            const errJson = await secureRes.json().catch(() => null) as { error?: string; detail?: string } | null
            const detail = errJson?.detail || errJson?.error || `HTTP ${secureRes.status}`
            throw new Error(`secure-save failed: ${detail}`)
          }
        } catch (secureErr: any) {
          const msg = String(secureErr?.message || '')
          const repo = this.repositoryFactory.create('cmh_llm_provider')
          const trimmedFormApiKey = (this.form.apiKey ?? '').trim()
          const existingApiKey = (this.provider?.apiKey as string | null) ?? null
          const safeExistingApiKey = isUsableApiKey(existingApiKey) ? existingApiKey : null
          const safeFormApiKey = isUsableApiKey(trimmedFormApiKey) ? trimmedFormApiKey : null
          await repo.save({
            ...basePayload,
            // dummy/mock/placeholder 키는 절대 저장하지 않고 null 처리
            apiKey: this.form.type === 'cloud-api' ? (safeFormApiKey ?? safeExistingApiKey ?? null) : null,
          })

          if (shouldSaveCloudApiKey && (msg.includes('Failed to fetch') || msg.includes('ECONNREFUSED') || msg.includes('secure-save failed'))) {
            ;(this as any).createNotificationInfo({
              message: this.$t('cmh-provider.detail.engineUnavailable') as string,
            })
          }
        }

        // Provider 저장 직후 모델 목록을 즉시 재동기화하여
        // Chat 입력 셀렉터 UX가 곧바로 반영되도록 처리한다.
        try {
          const chatStore = useChatStore()
          await chatStore.loadModels()
          ;(this as any).createNotificationSuccess({
            message: this.$t('cmh-provider.detail.syncModelsSuccess') as string,
          })
        } catch {
          ;(this as any).createNotificationError({
            message: this.$t('cmh-provider.detail.syncModelsError') as string,
          })
        }

        this.$router.push({ name: 'cmh.provider.list' })
      } catch (err: any) {
        ;(this as any).createNotificationError({
          message: (err?.message as string) || (this.$t('cmh-provider.detail.saveError') as string),
        })
      } finally {
        this.isSaving = false
      }
    },

    onCancel(): void {
      this.$router.push({ name: 'cmh.provider.list' })
    },

    onFocusApiKey(): void {
      this.apiKeyReadonly = false
      // 자동완성으로 들어온 값 정리
      if ((this.form.apiKey ?? '').includes('•') || (this.form.apiKey ?? '').includes('*')) {
        this.form.apiKey = ''
      }
    },
  },
})

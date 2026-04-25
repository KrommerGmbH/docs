import { defineComponent, type PropType } from 'vue'
import type { AttachedFile, ModelOption } from '../../../../../store/chat.store'
import './cmh-chat-input.scss'
import template from './cmh-chat-input.html?raw'

export default defineComponent({
  name: 'cmh-chat-input',
  template,

  props: {
    inputText: { type: String, default: '' },
    pendingAttachments: { type: Array as PropType<AttachedFile[]>, default: () => [] },
    isStreaming: { type: Boolean, default: false },
    canSend: { type: Boolean, default: false },
    selectedModelName: { type: String, default: '' },
    modelsByProvider: { type: Object as PropType<Record<string, ModelOption[]>>, default: () => ({}) },
    selectedModelId: { type: String, default: '' },
    selectableAgents: { type: Array as PropType<{ id: string; name: string }[]>, default: () => [] },
    selectedAgentId: { type: String, default: '' },
    selectedAgentLabel: { type: String, default: '' },
    thinkingEnabled: { type: Boolean, default: false },
    sttStatus: { type: String, default: 'idle' },
    sttActive: { type: Boolean, default: false },
    ttsEnabled: { type: Boolean, default: false },
  },

  emits: [
    'send',
    'stop',
    'attach-file',
    'remove-attachment',
    'select-model',
    'select-agent',
    'toggle-thinking',
    'toggle-stt',
    'toggle-tts',
    'update:inputText',
    'file-input-change',
  ],

  data() {
    return {
      showModelDropdown: false,
      showAgentDropdown: false,
      showAllAttachments: false,
      activeProvider: '' as string,
      maxVisibleFiles: 4,
      modelSearchQuery: '' as string,
    }
  },

  computed: {
    activeProviderModels(): ModelOption[] {
      return this.modelsByProvider[this.activeProvider] ?? []
    },

    activeProviderHasNoApiKey(): boolean {
      const list = this.activeProviderModels
      if (list.length === 0) return false
      return list.every((m) => !m.hasApiKey)
    },

    selectedModelOption(): ModelOption | null {
      for (const models of Object.values(this.modelsByProvider)) {
        const found = models.find(m => m.id === this.selectedModelId)
        if (found) return found
      }
      return null
    },
    visibleAttachments(): AttachedFile[] {
      if (this.showAllAttachments) return this.pendingAttachments
      return this.pendingAttachments.slice(0, this.maxVisibleFiles)
    },

    filteredModels(): ModelOption[] {
      const models = this.activeProviderModels
      if (!this.modelSearchQuery) return models
      const q = this.modelSearchQuery.toLowerCase()
      return models.filter(
        (m) => m.name.toLowerCase().includes(q) || (m.description ?? '').toLowerCase().includes(q),
      )
    },
  },

  watch: {
    inputText() {
      this.$nextTick(() => this.autoResizeTextarea())
    },

    modelsByProvider: {
      immediate: true,
      handler(val: Record<string, ModelOption[]>) {
        const providers = Object.keys(val)
        if (providers.length > 0 && !this.activeProvider) {
          this.activeProvider = providers[0]
        }
      },
    },
  },

  mounted() {
    this.autoResizeTextarea()
    document.addEventListener('click', this.handleOutsideClick)
  },

  updated() {
    this.autoResizeTextarea()
  },

  beforeUnmount() {
    document.removeEventListener('click', this.handleOutsideClick)
  },

  methods: {
    handleOutsideClick(e: MouseEvent): void {
      const target = e.target as HTMLElement
      if (this.showModelDropdown && !target.closest('.cmh-chat-input__select-wrap') && !target.closest('.cmh-chat-input__model-picker')) {
        this.showModelDropdown = false
      }
      if (this.showAgentDropdown && !target.closest('.cmh-chat-input__select-wrap') && !target.closest('.cmh-chat-input__dropdown.is--agent')) {
        this.showAgentDropdown = false
      }
    },

    onInput(event: Event): void {
      const textarea = event.target as HTMLTextAreaElement
      this.$emit('update:inputText', textarea.value)
      this.autoResizeTextarea(textarea)
    },

    onTextareaMutate(): void {
      this.$nextTick(() => this.autoResizeTextarea())
    },

    autoResizeTextarea(target?: HTMLTextAreaElement): void {
      const textarea = target ?? (this.$refs.inputTextarea as HTMLTextAreaElement | undefined)
      if (!textarea) return
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 220)}px`
    },

    onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        this.$emit('send')
      }
    },

    onAttachFile(): void {
      const fileInput = this.$refs.fileInput as HTMLInputElement | undefined
      if (fileInput) {
        fileInput.value = ''
        fileInput.click()
      }
    },

    onFileInputChange(event: Event): void {
      this.$emit('file-input-change', event)
    },

    onSelectModel(modelId: string): void {
      this.$emit('select-model', modelId)
      this.showModelDropdown = false
      this.modelSearchQuery = ''
    },

    onModelSearch(): void {
      // reactivity handled by v-model + filteredModels computed
    },

    onSelectAgent(agentId: string): void {
      this.$emit('select-agent', agentId)
      this.showAgentDropdown = false
    },

    onToggleThinking(value: boolean): void {
      this.$emit('toggle-thinking', value)
    },

    fileTypeIcon(filename: string): string {
      const ext = filename.split('.').pop()?.toLowerCase() ?? ''
      const map: Record<string, string> = {
        pdf: 'ph:file-pdf', md: 'ph:file-text', jpg: 'ph:file-jpg', jpeg: 'ph:file-jpg',
        png: 'ph:file-png', doc: 'ph:file-doc', docx: 'ph:file-doc', txt: 'ph:file-text',
        csv: 'ph:file-csv', xls: 'ph:file-xls', xlsx: 'ph:file-xls',
      }
      return map[ext] ?? 'ph:file-text'
    },

    getModelTypeLabel(type: ModelOption['type'] | string): string {
      const map: Record<string, string> = {
        chat: this.$t('cmh-global.chat.modelTypeChat') as string,
        vision: this.$t('cmh-global.chat.modelTypeVision') as string,
        embedding: this.$t('cmh-global.chat.modelTypeEmbedding') as string,
        multimodal: this.$t('cmh-global.chat.modelTypeMultimodal') as string,
      }
      return map[type] ?? String(type)
    },

    getModelTypeTooltip(type: ModelOption['type'] | string): string {
      const map: Record<string, string> = {
        chat: this.$t('cmh-global.chat.modelTypeChatDesc') as string,
        vision: this.$t('cmh-global.chat.modelTypeVisionDesc') as string,
        embedding: this.$t('cmh-global.chat.modelTypeEmbeddingDesc') as string,
        multimodal: this.$t('cmh-global.chat.modelTypeMultimodalDesc') as string,
      }
      return map[type] ?? ''
    },
  },
})


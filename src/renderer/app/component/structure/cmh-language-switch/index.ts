import { computed, defineComponent, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useUiPreferencesStore } from '../../../store/ui-preferences.store'
import { SUPPORTED_LOCALES, type AppLocale } from '../../../init/i18n'
import template from './cmh-language-switch.html?raw'
import './cmh-language-switch.scss'

export default defineComponent({
  name: 'cmh-language-switch',
  template,
  emits: ['change'],

  setup(_, { emit }) {
    const { t, locale } = useI18n()
    const uiPreferencesStore = useUiPreferencesStore()
    const selectedLocale = ref<AppLocale>(locale.value as AppLocale)

    watch(
      () => locale.value,
      (value) => {
        selectedLocale.value = value as AppLocale
      },
    )

    const localeOptions = computed(() => SUPPORTED_LOCALES.map((value) => ({
      value,
      label: t(`cmh-global.languageSwitch.locales.${value}`),
    })))

    function onChange(value: string): void {
      const next = SUPPORTED_LOCALES.includes(value as AppLocale)
        ? (value as AppLocale)
        : 'ko-KR'
      const nextLocale = uiPreferencesStore.setLocale(next)
      selectedLocale.value = nextLocale as AppLocale
      emit('change', nextLocale)
    }

    return {
      localeOptions,
      selectedLocale,
      onChange,
    }
  },
})

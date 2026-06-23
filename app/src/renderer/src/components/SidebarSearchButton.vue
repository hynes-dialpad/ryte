<script setup lang="ts">
import IconSearch from './icons/IconSearch.vue'

defineEmits<{
  search: []
}>()
</script>

<template>
  <button type="button" class="sidebar-search-button" @click="$emit('search')">
    <IconSearch />
    <span>Search documents</span>
  </button>
</template>

<style scoped>
.sidebar-search-button {
  width: 100%;
  height: 2.5em;
  display: flex;
  align-items: center;
  gap: 0.75em;
  box-sizing: border-box;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 0.5em;
  padding: 0.5em;
  background: rgba(255, 255, 255, 0.03);
  color: rgba(255, 255, 255, 0.5);
  font: inherit;
  font-size: 12px;
  line-height: 1;
  text-align: left;
  cursor: pointer;
  -webkit-app-region: no-drag;
}

.sidebar-search-button:hover,
.sidebar-search-button:focus-visible {
  border-color: rgba(255, 255, 255, 0.34);
  background: rgba(255, 255, 255, 0.06);
  color: #ffffff;
  outline: 0;
}

.sidebar-search-button :deep(.ryte-svg-icon) {
  width: 14px;
  height: 14px;
}

.sidebar-search-button span {
  min-width: 0;
  white-space: nowrap;
}
</style>

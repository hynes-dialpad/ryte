<template>
  <nav class="home-sidebar ryte-scrollbar ryte-scrollbar--y" aria-label="Home sidebar">
    <div class="home-placeholder" aria-hidden="true"></div>
  </nav>
</template>

<style scoped>
.home-sidebar {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  outline: none;
  background: rgba(0, 0, 0, 0.1);
}

.home-placeholder {
  min-height: 100%;
}
</style>

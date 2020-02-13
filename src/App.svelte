<script>
  import {scale} from 'svelte/transition';
  import {groups} from './test';
  import {test} from './store.js';
  import Greeting from "./Greeting.svelte";
  import Question from "./Question.svelte";
  import Results from "./Results.svelte";

  let isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  let activeStep = -1;
  let results = [];

  let newvalueX;
  let newvalueY;
  const movementStrength = 25;
  const height = movementStrength / window.innerHeight;
  const width = movementStrength / window.innerWidth;

  const onMouseMove = (event) => {
    let pageX = event.pageX - (window.innerWidth / 2);
    let pageY = event.pageY - (window.innerHeight / 2);
    newvalueX = width * pageX * - 1 - 25;
    newvalueY = height * pageY * - 1 - 50;
  };

  const nextStep = (event) => {
    activeStep += 1;
    if (event.detail.group) {
      console.log(event.detail);
      results = [...results, event.detail.group];
    }
  };

  const prevStep = () => {
    activeStep -= 1;
    if (results.length) results = [...results.pop()];
  };
</script>

<div class="wrap {isDark ? 'violet' : 'orange'}" style="background-position: {newvalueX}px {newvalueY}px" on:mousemove={onMouseMove}>
  <div class="test container">

      {#if activeStep === -1}
        <div class="ttt" in:scale="{{duration: 350, delay: 350, opacity: 0, start: 0.5}}"
             out:scale="{{duration: 350, opacity: 0, start: 0.5}}">
          <Greeting/>
          <div class="test buttons">
            <button class="test button" on:click={nextStep}><span>Далее</span></button>
          </div>
        </div>
      {:else if activeStep < test.length}
          {#each test as t, i}
              {#if i === activeStep}
                <div class="ttt" in:scale="{{duration: 350, delay: 350, opacity: 0, start: 0.5}}"
                     out:scale="{{duration: 350, opacity: 0, start: 0.5}}">
                  <Question totalQuestions={test.length} question={t} index={i} on:next={nextStep} on:prev={prevStep}
                            results={results}/>
                </div>
              {/if}
          {/each}
      {:else}
      <div class="result" in:scale="{{duration: 350, delay: 350, opacity: 0, start: 0.5}}"
           out:scale="{{duration: 350, opacity: 0, start: 0.5}}">
        <Results />
      </div>
      {/if}
  </div>
  <input type="checkbox" class="switch input" id="switch" bind:checked={isDark}><label class="switch label"
                                                                                       for="switch">Переключить
  тему</label>
</div>

<style>

  .test.container {
    position: relative;
  }

  .ttt {
    position: absolute;
    left: 120px;
    right: 120px;
    top: 120px;
    bottom: 120px;
    display: flex;
    justify-content: center;
    flex-direction: column;
  }
</style>

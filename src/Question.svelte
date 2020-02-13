<script>
  import { createEventDispatcher } from 'svelte';
  export let index;
  export let totalQuestions;
  export let question;
  export let results;

  let group;
  const dispatch = createEventDispatcher();

  const handleNext = () => {
    dispatch('next', {
      index: index,
      group: group,
    });
  }

  const handlePrev = () => {
    dispatch('prev');
  }
</script>

<form class="test form">
  <p class="test form message">Выберите одно из двух утверждений, которое вам ближе:</p>

<span class="test form counter">{index + 1}/{totalQuestions}</span>
<label class="test form pair label"><input class="test form pair input" type="radio" bind:group={group} value={question.questions[0].group}><span
    class="test form pair text">{question.questions[0].variant}</span></label>
<label class="test form pair label"><input class="test form pair input" type="radio" bind:group={group} value={question.questions[1].group}><span
    class="test form pair text">{question.questions[1].variant}</span></label>
</form>

<div class="test buttons">
  <button class="test button" on:click={handlePrev}><span>Назад</span></button>
  <button class="test button" disabled={!group} on:click={handleNext}><span>Далее</span></button>
</div>

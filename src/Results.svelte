<script>
  import { onMount } from 'svelte';
  import {resultText} from './store.js';

  export let results;
  export let totalQuestions;

  const countedResults = results.reduce((acc, cur) => {
    if (acc[cur]) acc[cur] += 1;
    else acc[cur] = 1;
    return acc;
  }, {});

  let a = [];
  let chartData = [];

  for (let key in countedResults) {
    a.push({
      group: key,
      count: countedResults[key],
    });
    chartData.push({
      profession: resultText[key].name,
      points: countedResults[key],
    })
  }
  a.sort((a, b) => b.count - a.count);

  const gerPercents = (count, total) => {
    return (count / total * 100).toFixed(1);
  }

  const mainResult = resultText[a[0].group];
  const nextResult = resultText[a[1].group];

  onMount(() => {
    const chart = am4core.create(document.getElementById("pie"), am4charts.PieChart);
    am4core.useTheme(am4themes_animated);
    am4core.useTheme(am4themes_material);

    console.log(chart);
    console.log(chartData);

    chart.data = [...chartData];

    chart.innerRadius = am4core.percent(40);
    var pieSeries = chart.series.push(new am4charts.PieSeries());
    pieSeries.dataFields.value = "points";
    pieSeries.dataFields.category = "profession";
    pieSeries.labels.template.maxWidth = 120;
    pieSeries.labels.template.wrap = true;
    pieSeries.labels.template.truncard = true;
  })

</script>

<div class="test message">
  <h1 class="test heading">Поздравляю, вы прошли тест!</h1>
  <div class="test text">
    <p class="test paragraph result">Вам подходит направление в IT:<span
        class="result profession">{mainResult.name} – {gerPercents(a[0].count, totalQuestions)}%</span></p>
      {#each mainResult.p as p}
        <p class="test paragraph">{p}</p>
      {/each}
    <p class="test paragraph">Рекомендуем продолжить изучать программирование на курсах:</p>
    <ul class="test list">
        {#each mainResult.recommendations as r}
          <li><a target="_blank" href="{r.link}">{r.text}</a></li>
        {/each}
    </ul>

    <ul id="legend">
      <li>
        <span class="profession">Fullstack-разработчик</span>
        <span class="points">{countedResults[1]}</span>
      </li>
      <li>
        <span class="profession">Тестировщик</span>
        <span class="points">{countedResults[2]}</span>
      </li>
      <li>
        <span class="profession">Фронтенд-разработчик</span>
        <span class="points">{countedResults[3]}</span>
      </li>
      <li>
        <span class="profession">Мобильный разработчик</span>
        <span class="points">{countedResults[4]}</span>
      </li>
    </ul>
    <div id="pie"></div>

    <p class="test paragraph">Также вы можете обратить внимание на профессию {nextResult.name}:
        {#each nextResult.recommendations as r, index}
          <a target="_blank" href="{r.link}">{r.text}</a>{#if index < nextResult.recommendations.length - 1}<span class="zpt">,&nbsp;</span>{/if}
        {/each}
      .</p>
  </div>
</div>

<style>
</style>


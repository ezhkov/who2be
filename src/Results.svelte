<script>
  import { onMount } from 'svelte';
  import {resultText} from './store.js';

  export let results;
  export let totalQuestions;
  export let isDark;

  const countedResults = results.reduce((acc, cur) => {
    if (acc[cur]) acc[cur] += 1;
    else acc[cur] = 1;
    return acc;
  }, {});

  let a = [];
  let chartData = [];
  let pieSeries;

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

  function am4themes_myTheme(target) {
    if (target instanceof am4charts.Axis) {
      target.background.fill = am4core.color("#DCCCA3");
    }
  }

  const createPie = () => {
    // Create chart instance
    const chart = am4core.create(document.getElementById("pie"), am4charts.PieChart);
    am4core.useTheme(am4themes_animated);
    am4core.useTheme(am4themes_material);
    am4core.useTheme(am4themes_myTheme);

    //Add data
    chart.data = [...chartData];

    // Add and configure Series
    chart.innerRadius = am4core.percent(40);
    pieSeries = chart.series.push(new am4charts.PieSeries());
    pieSeries.dataFields.value = "points";
    pieSeries.dataFields.category = "profession";
    pieSeries.labels.template.maxWidth = 120;
    pieSeries.labels.template.wrap = true;
    pieSeries.labels.template.truncard = true;
    pieSeries.labels.template.fill = isDark ? "#ffffff" : "#000000";
    pieSeries.ticks.template.stroke = isDark ? "#ffffff" : "#000000";
  };

  const changeTheme = (isDark) => {
    if (pieSeries) {
      pieSeries.labels.template.fill = isDark ? "#ffffff" : "#000000";
      pieSeries.ticks.template.stroke = isDark ? "#ffffff" : "#000000";
    }
  };


  onMount(() => {
    createPie();
  });

  $: changeTheme(isDark);

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


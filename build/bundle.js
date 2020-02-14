
(function(l, r) { if (l.getElementById('livereloadscript')) return; r = l.createElement('script'); r.async = 1; r.src = '//' + (window.location.host || 'localhost').split(':')[0] + ':35729/livereload.js?snipver=1'; r.id = 'livereloadscript'; l.head.appendChild(r) })(window.document);
var app = (function () {
    'use strict';

    function noop() { }
    const identity = x => x;
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }

    const is_client = typeof window !== 'undefined';
    let now = is_client
        ? () => window.performance.now()
        : () => Date.now();
    let raf = is_client ? cb => requestAnimationFrame(cb) : noop;

    const tasks = new Set();
    function run_tasks(now) {
        tasks.forEach(task => {
            if (!task.c(now)) {
                tasks.delete(task);
                task.f();
            }
        });
        if (tasks.size !== 0)
            raf(run_tasks);
    }
    /**
     * Creates a new task that runs on each raf frame
     * until it returns a falsy value or is aborted
     */
    function loop(callback) {
        let task;
        if (tasks.size === 0)
            raf(run_tasks);
        return {
            promise: new Promise(fulfill => {
                tasks.add(task = { c: callback, f: fulfill });
            }),
            abort() {
                tasks.delete(task);
            }
        };
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function destroy_each(iterations, detaching) {
        for (let i = 0; i < iterations.length; i += 1) {
            if (iterations[i])
                iterations[i].d(detaching);
        }
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function empty() {
        return text('');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_style(node, key, value, important) {
        node.style.setProperty(key, value, important ? 'important' : '');
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }

    let stylesheet;
    let active = 0;
    let current_rules = {};
    // https://github.com/darkskyapp/string-hash/blob/master/index.js
    function hash(str) {
        let hash = 5381;
        let i = str.length;
        while (i--)
            hash = ((hash << 5) - hash) ^ str.charCodeAt(i);
        return hash >>> 0;
    }
    function create_rule(node, a, b, duration, delay, ease, fn, uid = 0) {
        const step = 16.666 / duration;
        let keyframes = '{\n';
        for (let p = 0; p <= 1; p += step) {
            const t = a + (b - a) * ease(p);
            keyframes += p * 100 + `%{${fn(t, 1 - t)}}\n`;
        }
        const rule = keyframes + `100% {${fn(b, 1 - b)}}\n}`;
        const name = `__svelte_${hash(rule)}_${uid}`;
        if (!current_rules[name]) {
            if (!stylesheet) {
                const style = element('style');
                document.head.appendChild(style);
                stylesheet = style.sheet;
            }
            current_rules[name] = true;
            stylesheet.insertRule(`@keyframes ${name} ${rule}`, stylesheet.cssRules.length);
        }
        const animation = node.style.animation || '';
        node.style.animation = `${animation ? `${animation}, ` : ``}${name} ${duration}ms linear ${delay}ms 1 both`;
        active += 1;
        return name;
    }
    function delete_rule(node, name) {
        node.style.animation = (node.style.animation || '')
            .split(', ')
            .filter(name
            ? anim => anim.indexOf(name) < 0 // remove specific animation
            : anim => anim.indexOf('__svelte') === -1 // remove all Svelte animations
        )
            .join(', ');
        if (name && !--active)
            clear_rules();
    }
    function clear_rules() {
        raf(() => {
            if (active)
                return;
            let i = stylesheet.cssRules.length;
            while (i--)
                stylesheet.deleteRule(i);
            current_rules = {};
        });
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error(`Function called outside component initialization`);
        return current_component;
    }
    function onMount(fn) {
        get_current_component().$$.on_mount.push(fn);
    }
    function createEventDispatcher() {
        const component = get_current_component();
        return (type, detail) => {
            const callbacks = component.$$.callbacks[type];
            if (callbacks) {
                // TODO are there situations where events could be dispatched
                // in a server (non-DOM) environment?
                const event = custom_event(type, detail);
                callbacks.slice().forEach(fn => {
                    fn.call(component, event);
                });
            }
        };
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            dirty_components.length = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        flushing = false;
        seen_callbacks.clear();
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }

    let promise;
    function wait() {
        if (!promise) {
            promise = Promise.resolve();
            promise.then(() => {
                promise = null;
            });
        }
        return promise;
    }
    function dispatch(node, direction, kind) {
        node.dispatchEvent(custom_event(`${direction ? 'intro' : 'outro'}${kind}`));
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }
    const null_transition = { duration: 0 };
    function create_in_transition(node, fn, params) {
        let config = fn(node, params);
        let running = false;
        let animation_name;
        let task;
        let uid = 0;
        function cleanup() {
            if (animation_name)
                delete_rule(node, animation_name);
        }
        function go() {
            const { delay = 0, duration = 300, easing = identity, tick = noop, css } = config || null_transition;
            if (css)
                animation_name = create_rule(node, 0, 1, duration, delay, easing, css, uid++);
            tick(0, 1);
            const start_time = now() + delay;
            const end_time = start_time + duration;
            if (task)
                task.abort();
            running = true;
            add_render_callback(() => dispatch(node, true, 'start'));
            task = loop(now => {
                if (running) {
                    if (now >= end_time) {
                        tick(1, 0);
                        dispatch(node, true, 'end');
                        cleanup();
                        return running = false;
                    }
                    if (now >= start_time) {
                        const t = easing((now - start_time) / duration);
                        tick(t, 1 - t);
                    }
                }
                return running;
            });
        }
        let started = false;
        return {
            start() {
                if (started)
                    return;
                delete_rule(node);
                if (is_function(config)) {
                    config = config();
                    wait().then(go);
                }
                else {
                    go();
                }
            },
            invalidate() {
                started = false;
            },
            end() {
                if (running) {
                    cleanup();
                    running = false;
                }
            }
        };
    }
    function create_out_transition(node, fn, params) {
        let config = fn(node, params);
        let running = true;
        let animation_name;
        const group = outros;
        group.r += 1;
        function go() {
            const { delay = 0, duration = 300, easing = identity, tick = noop, css } = config || null_transition;
            if (css)
                animation_name = create_rule(node, 1, 0, duration, delay, easing, css);
            const start_time = now() + delay;
            const end_time = start_time + duration;
            add_render_callback(() => dispatch(node, false, 'start'));
            loop(now => {
                if (running) {
                    if (now >= end_time) {
                        tick(0, 1);
                        dispatch(node, false, 'end');
                        if (!--group.r) {
                            // this will result in `end()` being called,
                            // so we don't need to clean up here
                            run_all(group.c);
                        }
                        return false;
                    }
                    if (now >= start_time) {
                        const t = easing((now - start_time) / duration);
                        tick(1 - t, t);
                    }
                }
                return running;
            });
        }
        if (is_function(config)) {
            wait().then(() => {
                // @ts-ignore
                config = config();
                go();
            });
        }
        else {
            go();
        }
        return {
            end(reset) {
                if (reset && config.tick) {
                    config.tick(1, 0);
                }
                if (running) {
                    if (animation_name)
                        delete_rule(node, animation_name);
                    running = false;
                }
            }
        };
    }

    const globals = (typeof window !== 'undefined' ? window : global);
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const prop_values = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, prop_values, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if ($$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(children(options.target));
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set() {
            // overridden by instance, if it has props
        }
    }

    function dispatch_dev(type, detail) {
        document.dispatchEvent(custom_event(type, Object.assign({ version: '3.18.2' }, detail)));
    }
    function append_dev(target, node) {
        dispatch_dev("SvelteDOMInsert", { target, node });
        append(target, node);
    }
    function insert_dev(target, node, anchor) {
        dispatch_dev("SvelteDOMInsert", { target, node, anchor });
        insert(target, node, anchor);
    }
    function detach_dev(node) {
        dispatch_dev("SvelteDOMRemove", { node });
        detach(node);
    }
    function listen_dev(node, event, handler, options, has_prevent_default, has_stop_propagation) {
        const modifiers = options === true ? ["capture"] : options ? Array.from(Object.keys(options)) : [];
        if (has_prevent_default)
            modifiers.push('preventDefault');
        if (has_stop_propagation)
            modifiers.push('stopPropagation');
        dispatch_dev("SvelteDOMAddEventListener", { node, event, handler, modifiers });
        const dispose = listen(node, event, handler, options);
        return () => {
            dispatch_dev("SvelteDOMRemoveEventListener", { node, event, handler, modifiers });
            dispose();
        };
    }
    function attr_dev(node, attribute, value) {
        attr(node, attribute, value);
        if (value == null)
            dispatch_dev("SvelteDOMRemoveAttribute", { node, attribute });
        else
            dispatch_dev("SvelteDOMSetAttribute", { node, attribute, value });
    }
    function prop_dev(node, property, value) {
        node[property] = value;
        dispatch_dev("SvelteDOMSetProperty", { node, property, value });
    }
    function set_data_dev(text, data) {
        data = '' + data;
        if (text.data === data)
            return;
        dispatch_dev("SvelteDOMSetData", { node: text, data });
        text.data = data;
    }
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error(`'target' is a required option`);
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn(`Component was already destroyed`); // eslint-disable-line no-console
            };
        }
    }

    function cubicOut(t) {
        const f = t - 1.0;
        return f * f * f + 1.0;
    }

    function scale(node, { delay = 0, duration = 400, easing = cubicOut, start = 0, opacity = 0 }) {
        const style = getComputedStyle(node);
        const target_opacity = +style.opacity;
        const transform = style.transform === 'none' ? '' : style.transform;
        const sd = 1 - start;
        const od = target_opacity * (1 - opacity);
        return {
            delay,
            duration,
            easing,
            css: (_t, u) => `
			transform: ${transform} scale(${1 - (sd * u)});
			opacity: ${target_opacity - (od * u)}
		`
        };
    }

    const test = [{
      questions: [
        {
          variant: 'Работать над созданием приложений с виртуальной или дополненной реальностью',
          group: 4,
        },
        {
          variant: 'Делать из макетов дизайнеров красивые и аккуратные сайты',
          group: 3,
        },
      ],
      isActive: true,
    }, {
      questions: [
        {
          variant: 'Создавать в мобильном приложении плавные переходы и интересные анимации',
          group: 4,
        },
        {
          variant: 'Придумывать новые и нетривиальные способы поиска ошибок',
          group: 2,
        },
      ],
      isActive: false,
    }, {
      questions: [
        {
          variant: 'Делать мобильное приложение удобным и комфортным для пользователя',
          group: 4,
        },
        {
          variant: 'Делать важную, но малозаметную работу: оптимизировать, настраивать и обеспечивать надежность сайта',
          group: 1,
        },
      ],
      isActive: false,
    }, {
      questions: [
        {
          variant: 'Программировать сайты так, чтобы на любых устройствах они отображались хорошо',
          group: 3,
        },
        {
          variant: 'Искать ошибки и придумывать способы, как лучше их исправить',
          group: 2,
        },
      ],
      isActive: false,
    }, {
      questions: [
        {
          variant: 'Быть специалистом, от внимания которого не ускользнет ни один сдвинутый пиксель',
          group: 2,
        },
        {
          variant: 'Уметь делать всю работу целиком - от идеи и до последней строчки кода',
          group: 1,
        },
      ],
      isActive: false,
    }, {
      questions: [
        {
          variant: 'Делать сайты удобными и понятными для пользователей',
          group: 3,
        },
        {
          variant: 'Разносторонне продумывать логику и внутреннюю структуру будущей программы',
          group: 1,
        },
      ],
      isActive: false,
    }, {
      questions: [
        {
          variant: 'Активно использовать в программировании микрофон, камеру, геолокацию и др. функции мобильного телефона',
          group: 4,
        },
        {
          variant: 'Делать сайты комфортными для людей с ограниченными возможностями',
          group: 3,
        },
      ],
      isActive: false,
    }, {
      questions: [
        {
          variant: 'Работать над программированием новых фишек мобильного приложения',
          group: 4,
        },
        {
          variant: 'Придумывать программы, которые автоматически ищут ошибки',
          group: 2,
        },
      ],
      isActive: false,
    }, {
      questions: [
        {
          variant: 'Внедрять в мобильное приложение аналитику поведения пользователя',
          group: 4,
        },
        {
          variant: 'Уметь одинаково хорошо и настраивать операционные системы, и программировать сайты',
          group: 1,
        },
      ],
      isActive: false,
    }, {
      questions: [
        {
          variant: 'Создавать на сайте интересные эффекты и анимации',
          group: 3,
        },
        {
          variant: 'Педантично, шаг за шагом, проверять правильность работы каждой детали',
          group: 2,
        },
      ],
      isActive: false,
    }, {
      questions: [
        {
          variant: 'Программировать различные детали сайта - кнопки, прогресс-бары и др.',
          group: 3,
        },
        {
          variant: 'Анализировать разнородные данные и собирать их в единое целое',
          group: 1,
        },
      ],
      isActive: false,
    }, {
      questions: [
        {
          variant: 'Находить даже минимальные расхождения между тем, как должна работать программа, и тем, как она работает сейчас',
          group: 2,
        },
        {
          variant: 'Разбираться во всех областях программирования, пусть даже и поверхностно',
          group: 1,
        },
      ],
      isActive: false,
    },
    ];


    const resultText = {
      1: {
        name: 'Fullstack-разработчик',
        p: [
          'Фулстек веб-разработчик – это программист, который способен принимать активное участие во всех этапах разработки: начиная с разработки серверной логики будущего приложения и заканчивая клиентским кодом, работающим в браузере.',
          'Наиболее ценно в таком специалисте умение планировать структуру приложения, представлять, как все его части будут взаимодействовать друг с другом и с внешними компонентами. Первостепенная задача – обеспечить создание правильного скелета приложения, который в дальнейшем выдержит нарастающую нагрузку в виде новых фич и компонентов. Фулстек-разработчик может самостоятельно сделать свое приложение “под ключ”.'
        ],
        recommendations: [
          {
            text: 'Веб-разработчик с нуля',
            link: 'https://netology.ru/programs/web-developer',
          },
          {
            text: 'Python-разработчик',
            link: 'https://netology.ru/programs/python',
          },
          {
            text: 'Golang-разработчик с нуля',
            link: 'https://netology.ru/programs/godeveloper',
          },
          {
            text: 'Django: создание функциональных веб-приложений',
            link: 'https://netology.ru/programs/django',
          }
        ],
      },
      2: {
        name: 'Тестировщик',
        p: [
          'QA-инженер или тестировщик – это специалист, который отвечает за качество и безошибочную работу продукта. Он тестирует продукт, ищет возможные ошибки и исправляет их. Тестировщики часто проверяют не только правильность работы продукта, но и работу программистов, поэтому иногда просматривают их код:)',
          'Очень привлекательной эта профессия стала из-за того, что на начальных этапах профессия не всегда требует знаний языков программирования, обширного технического бэкграунда, глубокого понимания современных технологий и т.д.  Поэтому начать IT карьеру с тестировщика – это наиболее частый и простой выбор IT новичков или людей, которые переучиваются со своей текущей специальности на IT.',
        ],
        recommendations: [
          {
            text: 'Тестировщик',
            link: 'https://netology.ru/programs/qa'
          }
        ],
      },
      3: {
        name: 'Фронтенд-разработчик',
        p: [
          'Фронтенд-разработчик – программист, создающий внешний пользовательский функционал web-сайта и отвечающий за его соответствие макету дизайна и за единообразное отображение страниц в любом браузере. Это специалист, от которого зависит, насколько удобным и функциональным будет интерфейс сайта или приложения.',
          'В некоторых случаях, если макет не отражает деталей концепта, фронтенд-разработчик может проявлять себя в качестве дизайнера, когда от сотрудника требуется верстка уже готового макета (с помощью связки HTML+CSS).'
        ],
        recommendations: [
          {
            text: 'Frontend-разработчик',
            link: 'https://netology.ru/programs/front-end',
          },
          {
            text: 'React: библиотека фронтенд-разработки',
            link: 'https://netology.ru/programs/react',
          }
        ],
      },
      4: {
        name: 'Мобильный разработчик',
        p: [
          'Мобильный разработчик — это специалист, разрабатывающий программные приложения для различных мобильных устройств: планшетов, смартфонов. Сейчас эта профессия очень популярная, перспективная и востребованная. Ведь именно в сфере мобильной разработки появились такие интересные новинки как голосовой и жестовый интерфейс.',
        ],
        recommendations: [
          {
            text: 'Android-разработчик с нуля',
            link: 'https://netology.ru/programs/android-app',
          },
          {
            text: 'iOS-разработчик с нуля',
            link: 'https://netology.ru/programs/ios-developer',
          },
          {
            text: 'Разработчик на Kotlin',
            link: 'https://netology.ru/programs/kotlindevelopment',
          },
        ]
      }
    };

    /* src/Greeting.svelte generated by Svelte v3.18.2 */

    const file = "src/Greeting.svelte";

    function create_fragment(ctx) {
    	let div1;
    	let h1;
    	let t1;
    	let div0;
    	let p0;
    	let t3;
    	let p1;
    	let t5;
    	let p2;

    	const block = {
    		c: function create() {
    			div1 = element("div");
    			h1 = element("h1");
    			h1.textContent = "Какое направление в IT выбрать?";
    			t1 = space();
    			div0 = element("div");
    			p0 = element("p");
    			p0.textContent = "Пройдите тестирование и узнайте, какие профессии в программировании вам подходят!";
    			t3 = space();
    			p1 = element("p");
    			p1.textContent = "Тест поможет вам сориентироваться в IT-профессиях и покажет те, которые вам больше\n      всего подходят. Прохождение тестирования займет не более 2-3 минут.";
    			t5 = space();
    			p2 = element("p");
    			p2.textContent = "Чтобы начать прохождение теста, нажмите на «Далее» ниже.";
    			attr_dev(h1, "class", "test heading");
    			add_location(h1, file, 2, 2, 30);
    			attr_dev(p0, "class", "test paragraph");
    			add_location(p0, file, 4, 4, 122);
    			attr_dev(p1, "class", "test paragraph");
    			add_location(p1, file, 5, 4, 238);
    			attr_dev(p2, "class", "test paragraph");
    			add_location(p2, file, 7, 4, 429);
    			attr_dev(div0, "class", "test text");
    			add_location(div0, file, 3, 2, 94);
    			attr_dev(div1, "class", "test message");
    			add_location(div1, file, 1, 0, 1);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div1, anchor);
    			append_dev(div1, h1);
    			append_dev(div1, t1);
    			append_dev(div1, div0);
    			append_dev(div0, p0);
    			append_dev(div0, t3);
    			append_dev(div0, p1);
    			append_dev(div0, t5);
    			append_dev(div0, p2);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div1);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    class Greeting extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, null, create_fragment, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Greeting",
    			options,
    			id: create_fragment.name
    		});
    	}
    }

    /* src/Question.svelte generated by Svelte v3.18.2 */
    const file$1 = "src/Question.svelte";

    function create_fragment$1(ctx) {
    	let form;
    	let p;
    	let t1;
    	let span0;
    	let t2_value = /*index*/ ctx[0] + 1 + "";
    	let t2;
    	let t3;
    	let t4;
    	let t5;
    	let label0;
    	let input0;
    	let input0_value_value;
    	let span1;
    	let t6_value = /*question*/ ctx[2].questions[0].variant + "";
    	let t6;
    	let t7;
    	let label1;
    	let input1;
    	let input1_value_value;
    	let span2;
    	let t8_value = /*question*/ ctx[2].questions[1].variant + "";
    	let t8;
    	let t9;
    	let div;
    	let button0;
    	let span3;
    	let t11;
    	let button1;
    	let span4;
    	let button1_disabled_value;
    	let dispose;

    	const block = {
    		c: function create() {
    			form = element("form");
    			p = element("p");
    			p.textContent = "Выберите одно из двух утверждений, которое вам ближе:";
    			t1 = space();
    			span0 = element("span");
    			t2 = text(t2_value);
    			t3 = text("/");
    			t4 = text(/*totalQuestions*/ ctx[1]);
    			t5 = space();
    			label0 = element("label");
    			input0 = element("input");
    			span1 = element("span");
    			t6 = text(t6_value);
    			t7 = space();
    			label1 = element("label");
    			input1 = element("input");
    			span2 = element("span");
    			t8 = text(t8_value);
    			t9 = space();
    			div = element("div");
    			button0 = element("button");
    			span3 = element("span");
    			span3.textContent = "Назад";
    			t11 = space();
    			button1 = element("button");
    			span4 = element("span");
    			span4.textContent = "Далее";
    			attr_dev(p, "class", "test form message");
    			add_location(p, file$1, 23, 2, 410);
    			attr_dev(span0, "class", "test form counter");
    			add_location(span0, file$1, 25, 0, 498);
    			attr_dev(input0, "class", "test form pair input");
    			attr_dev(input0, "type", "radio");
    			input0.__value = input0_value_value = /*question*/ ctx[2].questions[0].group;
    			input0.value = input0.__value;
    			/*$$binding_groups*/ ctx[9][0].push(input0);
    			add_location(input0, file$1, 26, 36, 602);
    			attr_dev(span1, "class", "test form pair text");
    			add_location(span1, file$1, 26, 140, 706);
    			attr_dev(label0, "class", "test form pair label");
    			add_location(label0, file$1, 26, 0, 566);
    			attr_dev(input1, "class", "test form pair input");
    			attr_dev(input1, "type", "radio");
    			input1.__value = input1_value_value = /*question*/ ctx[2].questions[1].group;
    			input1.value = input1.__value;
    			/*$$binding_groups*/ ctx[9][0].push(input1);
    			add_location(input1, file$1, 28, 36, 827);
    			attr_dev(span2, "class", "test form pair text");
    			add_location(span2, file$1, 28, 140, 931);
    			attr_dev(label1, "class", "test form pair label");
    			add_location(label1, file$1, 28, 0, 791);
    			attr_dev(form, "class", "test form");
    			add_location(form, file$1, 22, 0, 383);
    			add_location(span3, file$1, 33, 52, 1104);
    			attr_dev(button0, "class", "test button");
    			add_location(button0, file$1, 33, 2, 1054);
    			add_location(span4, file$1, 34, 70, 1202);
    			attr_dev(button1, "class", "test button");
    			button1.disabled = button1_disabled_value = !/*group*/ ctx[3];
    			add_location(button1, file$1, 34, 2, 1134);
    			attr_dev(div, "class", "test buttons");
    			add_location(div, file$1, 32, 0, 1025);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, form, anchor);
    			append_dev(form, p);
    			append_dev(form, t1);
    			append_dev(form, span0);
    			append_dev(span0, t2);
    			append_dev(span0, t3);
    			append_dev(span0, t4);
    			append_dev(form, t5);
    			append_dev(form, label0);
    			append_dev(label0, input0);
    			input0.checked = input0.__value === /*group*/ ctx[3];
    			append_dev(label0, span1);
    			append_dev(span1, t6);
    			append_dev(form, t7);
    			append_dev(form, label1);
    			append_dev(label1, input1);
    			input1.checked = input1.__value === /*group*/ ctx[3];
    			append_dev(label1, span2);
    			append_dev(span2, t8);
    			insert_dev(target, t9, anchor);
    			insert_dev(target, div, anchor);
    			append_dev(div, button0);
    			append_dev(button0, span3);
    			append_dev(div, t11);
    			append_dev(div, button1);
    			append_dev(button1, span4);

    			dispose = [
    				listen_dev(input0, "change", /*input0_change_handler*/ ctx[8]),
    				listen_dev(input1, "change", /*input1_change_handler*/ ctx[10]),
    				listen_dev(button0, "click", /*handlePrev*/ ctx[5], false, false, false),
    				listen_dev(button1, "click", /*handleNext*/ ctx[4], false, false, false)
    			];
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*index*/ 1 && t2_value !== (t2_value = /*index*/ ctx[0] + 1 + "")) set_data_dev(t2, t2_value);
    			if (dirty & /*totalQuestions*/ 2) set_data_dev(t4, /*totalQuestions*/ ctx[1]);

    			if (dirty & /*question*/ 4 && input0_value_value !== (input0_value_value = /*question*/ ctx[2].questions[0].group)) {
    				prop_dev(input0, "__value", input0_value_value);
    			}

    			input0.value = input0.__value;

    			if (dirty & /*group*/ 8) {
    				input0.checked = input0.__value === /*group*/ ctx[3];
    			}

    			if (dirty & /*question*/ 4 && t6_value !== (t6_value = /*question*/ ctx[2].questions[0].variant + "")) set_data_dev(t6, t6_value);

    			if (dirty & /*question*/ 4 && input1_value_value !== (input1_value_value = /*question*/ ctx[2].questions[1].group)) {
    				prop_dev(input1, "__value", input1_value_value);
    			}

    			input1.value = input1.__value;

    			if (dirty & /*group*/ 8) {
    				input1.checked = input1.__value === /*group*/ ctx[3];
    			}

    			if (dirty & /*question*/ 4 && t8_value !== (t8_value = /*question*/ ctx[2].questions[1].variant + "")) set_data_dev(t8, t8_value);

    			if (dirty & /*group*/ 8 && button1_disabled_value !== (button1_disabled_value = !/*group*/ ctx[3])) {
    				prop_dev(button1, "disabled", button1_disabled_value);
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(form);
    			/*$$binding_groups*/ ctx[9][0].splice(/*$$binding_groups*/ ctx[9][0].indexOf(input0), 1);
    			/*$$binding_groups*/ ctx[9][0].splice(/*$$binding_groups*/ ctx[9][0].indexOf(input1), 1);
    			if (detaching) detach_dev(t9);
    			if (detaching) detach_dev(div);
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$1.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance($$self, $$props, $$invalidate) {
    	let { index } = $$props;
    	let { totalQuestions } = $$props;
    	let { question } = $$props;
    	let { results } = $$props;
    	let group;
    	const dispatch = createEventDispatcher();

    	const handleNext = () => {
    		dispatch("next", { index, group });
    	};

    	const handlePrev = () => {
    		dispatch("prev");
    	};

    	const writable_props = ["index", "totalQuestions", "question", "results"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Question> was created with unknown prop '${key}'`);
    	});

    	const $$binding_groups = [[]];

    	function input0_change_handler() {
    		group = this.__value;
    		$$invalidate(3, group);
    	}

    	function input1_change_handler() {
    		group = this.__value;
    		$$invalidate(3, group);
    	}

    	$$self.$set = $$props => {
    		if ("index" in $$props) $$invalidate(0, index = $$props.index);
    		if ("totalQuestions" in $$props) $$invalidate(1, totalQuestions = $$props.totalQuestions);
    		if ("question" in $$props) $$invalidate(2, question = $$props.question);
    		if ("results" in $$props) $$invalidate(6, results = $$props.results);
    	};

    	$$self.$capture_state = () => {
    		return {
    			index,
    			totalQuestions,
    			question,
    			results,
    			group
    		};
    	};

    	$$self.$inject_state = $$props => {
    		if ("index" in $$props) $$invalidate(0, index = $$props.index);
    		if ("totalQuestions" in $$props) $$invalidate(1, totalQuestions = $$props.totalQuestions);
    		if ("question" in $$props) $$invalidate(2, question = $$props.question);
    		if ("results" in $$props) $$invalidate(6, results = $$props.results);
    		if ("group" in $$props) $$invalidate(3, group = $$props.group);
    	};

    	return [
    		index,
    		totalQuestions,
    		question,
    		group,
    		handleNext,
    		handlePrev,
    		results,
    		dispatch,
    		input0_change_handler,
    		$$binding_groups,
    		input1_change_handler
    	];
    }

    class Question extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance, create_fragment$1, safe_not_equal, {
    			index: 0,
    			totalQuestions: 1,
    			question: 2,
    			results: 6
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Question",
    			options,
    			id: create_fragment$1.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*index*/ ctx[0] === undefined && !("index" in props)) {
    			console.warn("<Question> was created without expected prop 'index'");
    		}

    		if (/*totalQuestions*/ ctx[1] === undefined && !("totalQuestions" in props)) {
    			console.warn("<Question> was created without expected prop 'totalQuestions'");
    		}

    		if (/*question*/ ctx[2] === undefined && !("question" in props)) {
    			console.warn("<Question> was created without expected prop 'question'");
    		}

    		if (/*results*/ ctx[6] === undefined && !("results" in props)) {
    			console.warn("<Question> was created without expected prop 'results'");
    		}
    	}

    	get index() {
    		throw new Error("<Question>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set index(value) {
    		throw new Error("<Question>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get totalQuestions() {
    		throw new Error("<Question>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set totalQuestions(value) {
    		throw new Error("<Question>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get question() {
    		throw new Error("<Question>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set question(value) {
    		throw new Error("<Question>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get results() {
    		throw new Error("<Question>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set results(value) {
    		throw new Error("<Question>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src/Results.svelte generated by Svelte v3.18.2 */

    const { console: console_1 } = globals;
    const file$2 = "src/Results.svelte";

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[8] = list[i];
    	child_ctx[10] = i;
    	return child_ctx;
    }

    function get_each_context_1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[8] = list[i];
    	return child_ctx;
    }

    function get_each_context_2(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[13] = list[i];
    	return child_ctx;
    }

    // (62:6) {#each mainResult.p as p}
    function create_each_block_2(ctx) {
    	let p;
    	let t_value = /*p*/ ctx[13] + "";
    	let t;

    	const block = {
    		c: function create() {
    			p = element("p");
    			t = text(t_value);
    			attr_dev(p, "class", "test paragraph");
    			add_location(p, file$2, 62, 8, 1721);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, p, anchor);
    			append_dev(p, t);
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(p);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_2.name,
    		type: "each",
    		source: "(62:6) {#each mainResult.p as p}",
    		ctx
    	});

    	return block;
    }

    // (67:8) {#each mainResult.recommendations as r}
    function create_each_block_1(ctx) {
    	let li;
    	let a_1;
    	let t_value = /*r*/ ctx[8].text + "";
    	let t;
    	let a_1_href_value;

    	const block = {
    		c: function create() {
    			li = element("li");
    			a_1 = element("a");
    			t = text(t_value);
    			attr_dev(a_1, "target", "_blank");
    			attr_dev(a_1, "href", a_1_href_value = /*r*/ ctx[8].link);
    			add_location(a_1, file$2, 67, 14, 1951);
    			add_location(li, file$2, 67, 10, 1947);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, li, anchor);
    			append_dev(li, a_1);
    			append_dev(a_1, t);
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(li);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_1.name,
    		type: "each",
    		source: "(67:8) {#each mainResult.recommendations as r}",
    		ctx
    	});

    	return block;
    }

    // (94:57) {#if index < nextResult.recommendations.length - 1}
    function create_if_block(ctx) {
    	let span;

    	const block = {
    		c: function create() {
    			span = element("span");
    			span.textContent = ", ";
    			attr_dev(span, "class", "zpt");
    			add_location(span, file$2, 93, 108, 2900);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, span, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(span);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block.name,
    		type: "if",
    		source: "(94:57) {#if index < nextResult.recommendations.length - 1}",
    		ctx
    	});

    	return block;
    }

    // (93:8) {#each nextResult.recommendations as r, index}
    function create_each_block(ctx) {
    	let a_1;
    	let t_value = /*r*/ ctx[8].text + "";
    	let t;
    	let a_1_href_value;
    	let if_block_anchor;
    	let if_block = /*index*/ ctx[10] < /*nextResult*/ ctx[5].recommendations.length - 1 && create_if_block(ctx);

    	const block = {
    		c: function create() {
    			a_1 = element("a");
    			t = text(t_value);
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    			attr_dev(a_1, "target", "_blank");
    			attr_dev(a_1, "href", a_1_href_value = /*r*/ ctx[8].link);
    			add_location(a_1, file$2, 93, 10, 2802);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, a_1, anchor);
    			append_dev(a_1, t);
    			if (if_block) if_block.m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(a_1);
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block.name,
    		type: "each",
    		source: "(93:8) {#each nextResult.recommendations as r, index}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$2(ctx) {
    	let div2;
    	let h1;
    	let t1;
    	let div1;
    	let p0;
    	let t2;
    	let span0;
    	let t3_value = /*mainResult*/ ctx[4].name + "";
    	let t3;
    	let t4;
    	let t5_value = /*gerPercents*/ ctx[3](/*a*/ ctx[2][0].count, /*totalQuestions*/ ctx[0]) + "";
    	let t5;
    	let t6;
    	let t7;
    	let t8;
    	let p1;
    	let t10;
    	let ul0;
    	let t11;
    	let ul1;
    	let li0;
    	let span1;
    	let t13;
    	let span2;
    	let t15;
    	let li1;
    	let span3;
    	let t17;
    	let span4;
    	let t19;
    	let li2;
    	let span5;
    	let t21;
    	let span6;
    	let t23;
    	let li3;
    	let span7;
    	let t25;
    	let span8;
    	let t27;
    	let div0;
    	let t28;
    	let p2;
    	let t29;
    	let t30_value = /*nextResult*/ ctx[5].name + "";
    	let t30;
    	let t31;
    	let t32;
    	let each_value_2 = /*mainResult*/ ctx[4].p;
    	let each_blocks_2 = [];

    	for (let i = 0; i < each_value_2.length; i += 1) {
    		each_blocks_2[i] = create_each_block_2(get_each_context_2(ctx, each_value_2, i));
    	}

    	let each_value_1 = /*mainResult*/ ctx[4].recommendations;
    	let each_blocks_1 = [];

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		each_blocks_1[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
    	}

    	let each_value = /*nextResult*/ ctx[5].recommendations;
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
    	}

    	const block = {
    		c: function create() {
    			div2 = element("div");
    			h1 = element("h1");
    			h1.textContent = "Поздравляю, вы прошли тест!";
    			t1 = space();
    			div1 = element("div");
    			p0 = element("p");
    			t2 = text("Вам подходит направление в IT:");
    			span0 = element("span");
    			t3 = text(t3_value);
    			t4 = text(" – ");
    			t5 = text(t5_value);
    			t6 = text("%");
    			t7 = space();

    			for (let i = 0; i < each_blocks_2.length; i += 1) {
    				each_blocks_2[i].c();
    			}

    			t8 = space();
    			p1 = element("p");
    			p1.textContent = "Рекомендуем продолжить изучать программирование на курсах:";
    			t10 = space();
    			ul0 = element("ul");

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].c();
    			}

    			t11 = space();
    			ul1 = element("ul");
    			li0 = element("li");
    			span1 = element("span");
    			span1.textContent = "Fullstack-разработчик";
    			t13 = space();
    			span2 = element("span");
    			span2.textContent = `${/*countedResults*/ ctx[1][1]}`;
    			t15 = space();
    			li1 = element("li");
    			span3 = element("span");
    			span3.textContent = "Тестировщик";
    			t17 = space();
    			span4 = element("span");
    			span4.textContent = `${/*countedResults*/ ctx[1][2]}`;
    			t19 = space();
    			li2 = element("li");
    			span5 = element("span");
    			span5.textContent = "Фронтенд-разработчик";
    			t21 = space();
    			span6 = element("span");
    			span6.textContent = `${/*countedResults*/ ctx[1][3]}`;
    			t23 = space();
    			li3 = element("li");
    			span7 = element("span");
    			span7.textContent = "Мобильный разработчик";
    			t25 = space();
    			span8 = element("span");
    			span8.textContent = `${/*countedResults*/ ctx[1][4]}`;
    			t27 = space();
    			div0 = element("div");
    			t28 = space();
    			p2 = element("p");
    			t29 = text("Также вы можете обратить внимание на профессию ");
    			t30 = text(t30_value);
    			t31 = text(":\n        ");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t32 = text("\n      .");
    			attr_dev(h1, "class", "test heading");
    			add_location(h1, file$2, 57, 2, 1416);
    			attr_dev(span0, "class", "result profession");
    			add_location(span0, file$2, 59, 67, 1567);
    			attr_dev(p0, "class", "test paragraph result");
    			add_location(p0, file$2, 59, 4, 1504);
    			attr_dev(p1, "class", "test paragraph");
    			add_location(p1, file$2, 64, 4, 1773);
    			attr_dev(ul0, "class", "test list");
    			add_location(ul0, file$2, 65, 4, 1866);
    			attr_dev(span1, "class", "profession");
    			add_location(span1, file$2, 73, 8, 2071);
    			attr_dev(span2, "class", "points");
    			add_location(span2, file$2, 74, 8, 2133);
    			add_location(li0, file$2, 72, 6, 2058);
    			attr_dev(span3, "class", "profession");
    			add_location(span3, file$2, 77, 8, 2212);
    			attr_dev(span4, "class", "points");
    			add_location(span4, file$2, 78, 8, 2264);
    			add_location(li1, file$2, 76, 6, 2199);
    			attr_dev(span5, "class", "profession");
    			add_location(span5, file$2, 81, 8, 2343);
    			attr_dev(span6, "class", "points");
    			add_location(span6, file$2, 82, 8, 2404);
    			add_location(li2, file$2, 80, 6, 2330);
    			attr_dev(span7, "class", "profession");
    			add_location(span7, file$2, 85, 8, 2483);
    			attr_dev(span8, "class", "points");
    			add_location(span8, file$2, 86, 8, 2545);
    			add_location(li3, file$2, 84, 6, 2470);
    			attr_dev(ul1, "id", "legend");
    			add_location(ul1, file$2, 71, 4, 2035);
    			attr_dev(div0, "id", "pie");
    			add_location(div0, file$2, 89, 4, 2619);
    			attr_dev(p2, "class", "test paragraph");
    			add_location(p2, file$2, 91, 4, 2645);
    			attr_dev(div1, "class", "test text");
    			add_location(div1, file$2, 58, 2, 1476);
    			attr_dev(div2, "class", "test message");
    			add_location(div2, file$2, 56, 0, 1387);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div2, anchor);
    			append_dev(div2, h1);
    			append_dev(div2, t1);
    			append_dev(div2, div1);
    			append_dev(div1, p0);
    			append_dev(p0, t2);
    			append_dev(p0, span0);
    			append_dev(span0, t3);
    			append_dev(span0, t4);
    			append_dev(span0, t5);
    			append_dev(span0, t6);
    			append_dev(div1, t7);

    			for (let i = 0; i < each_blocks_2.length; i += 1) {
    				each_blocks_2[i].m(div1, null);
    			}

    			append_dev(div1, t8);
    			append_dev(div1, p1);
    			append_dev(div1, t10);
    			append_dev(div1, ul0);

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].m(ul0, null);
    			}

    			append_dev(div1, t11);
    			append_dev(div1, ul1);
    			append_dev(ul1, li0);
    			append_dev(li0, span1);
    			append_dev(li0, t13);
    			append_dev(li0, span2);
    			append_dev(ul1, t15);
    			append_dev(ul1, li1);
    			append_dev(li1, span3);
    			append_dev(li1, t17);
    			append_dev(li1, span4);
    			append_dev(ul1, t19);
    			append_dev(ul1, li2);
    			append_dev(li2, span5);
    			append_dev(li2, t21);
    			append_dev(li2, span6);
    			append_dev(ul1, t23);
    			append_dev(ul1, li3);
    			append_dev(li3, span7);
    			append_dev(li3, t25);
    			append_dev(li3, span8);
    			append_dev(div1, t27);
    			append_dev(div1, div0);
    			append_dev(div1, t28);
    			append_dev(div1, p2);
    			append_dev(p2, t29);
    			append_dev(p2, t30);
    			append_dev(p2, t31);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(p2, null);
    			}

    			append_dev(p2, t32);
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*totalQuestions*/ 1 && t5_value !== (t5_value = /*gerPercents*/ ctx[3](/*a*/ ctx[2][0].count, /*totalQuestions*/ ctx[0]) + "")) set_data_dev(t5, t5_value);

    			if (dirty & /*mainResult*/ 16) {
    				each_value_2 = /*mainResult*/ ctx[4].p;
    				let i;

    				for (i = 0; i < each_value_2.length; i += 1) {
    					const child_ctx = get_each_context_2(ctx, each_value_2, i);

    					if (each_blocks_2[i]) {
    						each_blocks_2[i].p(child_ctx, dirty);
    					} else {
    						each_blocks_2[i] = create_each_block_2(child_ctx);
    						each_blocks_2[i].c();
    						each_blocks_2[i].m(div1, t8);
    					}
    				}

    				for (; i < each_blocks_2.length; i += 1) {
    					each_blocks_2[i].d(1);
    				}

    				each_blocks_2.length = each_value_2.length;
    			}

    			if (dirty & /*mainResult*/ 16) {
    				each_value_1 = /*mainResult*/ ctx[4].recommendations;
    				let i;

    				for (i = 0; i < each_value_1.length; i += 1) {
    					const child_ctx = get_each_context_1(ctx, each_value_1, i);

    					if (each_blocks_1[i]) {
    						each_blocks_1[i].p(child_ctx, dirty);
    					} else {
    						each_blocks_1[i] = create_each_block_1(child_ctx);
    						each_blocks_1[i].c();
    						each_blocks_1[i].m(ul0, null);
    					}
    				}

    				for (; i < each_blocks_1.length; i += 1) {
    					each_blocks_1[i].d(1);
    				}

    				each_blocks_1.length = each_value_1.length;
    			}

    			if (dirty & /*nextResult*/ 32) {
    				each_value = /*nextResult*/ ctx[5].recommendations;
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(p2, t32);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div2);
    			destroy_each(each_blocks_2, detaching);
    			destroy_each(each_blocks_1, detaching);
    			destroy_each(each_blocks, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$2.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let { results } = $$props;
    	let { totalQuestions } = $$props;

    	const countedResults = results.reduce(
    		(acc, cur) => {
    			if (acc[cur]) acc[cur] += 1; else acc[cur] = 1;
    			return acc;
    		},
    		{}
    	);

    	let a = [];
    	let chartData = [];

    	for (let key in countedResults) {
    		a.push({ group: key, count: countedResults[key] });

    		chartData.push({
    			profession: resultText[key].name,
    			points: countedResults[key]
    		});
    	}

    	a.sort((a, b) => b.count - a.count);

    	const gerPercents = (count, total) => {
    		return (count / total * 100).toFixed(1);
    	};

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
    	});

    	const writable_props = ["results", "totalQuestions"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console_1.warn(`<Results> was created with unknown prop '${key}'`);
    	});

    	$$self.$set = $$props => {
    		if ("results" in $$props) $$invalidate(6, results = $$props.results);
    		if ("totalQuestions" in $$props) $$invalidate(0, totalQuestions = $$props.totalQuestions);
    	};

    	$$self.$capture_state = () => {
    		return { results, totalQuestions, a, chartData };
    	};

    	$$self.$inject_state = $$props => {
    		if ("results" in $$props) $$invalidate(6, results = $$props.results);
    		if ("totalQuestions" in $$props) $$invalidate(0, totalQuestions = $$props.totalQuestions);
    		if ("a" in $$props) $$invalidate(2, a = $$props.a);
    		if ("chartData" in $$props) chartData = $$props.chartData;
    	};

    	return [
    		totalQuestions,
    		countedResults,
    		a,
    		gerPercents,
    		mainResult,
    		nextResult,
    		results
    	];
    }

    class Results extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$1, create_fragment$2, safe_not_equal, { results: 6, totalQuestions: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Results",
    			options,
    			id: create_fragment$2.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*results*/ ctx[6] === undefined && !("results" in props)) {
    			console_1.warn("<Results> was created without expected prop 'results'");
    		}

    		if (/*totalQuestions*/ ctx[0] === undefined && !("totalQuestions" in props)) {
    			console_1.warn("<Results> was created without expected prop 'totalQuestions'");
    		}
    	}

    	get results() {
    		throw new Error("<Results>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set results(value) {
    		throw new Error("<Results>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get totalQuestions() {
    		throw new Error("<Results>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set totalQuestions(value) {
    		throw new Error("<Results>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src/App.svelte generated by Svelte v3.18.2 */
    const file$3 = "src/App.svelte";

    function get_each_context$1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[11] = list[i];
    	child_ctx[13] = i;
    	return child_ctx;
    }

    // (59:6) {:else}
    function create_else_block(ctx) {
    	let div;
    	let div_intro;
    	let div_outro;
    	let current;

    	const results_1 = new Results({
    			props: {
    				results: /*results*/ ctx[2],
    				totalQuestions: test.length
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			div = element("div");
    			create_component(results_1.$$.fragment);
    			attr_dev(div, "class", "result");
    			add_location(div, file$3, 59, 6, 2076);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			mount_component(results_1, div, null);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const results_1_changes = {};
    			if (dirty & /*results*/ 4) results_1_changes.results = /*results*/ ctx[2];
    			results_1.$set(results_1_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(results_1.$$.fragment, local);

    			add_render_callback(() => {
    				if (div_outro) div_outro.end(1);

    				if (!div_intro) div_intro = create_in_transition(div, scale, {
    					duration: 350,
    					delay: 350,
    					opacity: 0,
    					start: 0.5
    				});

    				div_intro.start();
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(results_1.$$.fragment, local);
    			if (div_intro) div_intro.invalidate();
    			div_outro = create_out_transition(div, scale, { duration: 350, opacity: 0, start: 0.5 });
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_component(results_1);
    			if (detaching && div_outro) div_outro.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block.name,
    		type: "else",
    		source: "(59:6) {:else}",
    		ctx
    	});

    	return block;
    }

    // (49:41) 
    function create_if_block_1(ctx) {
    	let each_1_anchor;
    	let current;
    	let each_value = test;
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$1(get_each_context$1(ctx, each_value, i));
    	}

    	const out = i => transition_out(each_blocks[i], 1, 1, () => {
    		each_blocks[i] = null;
    	});

    	const block = {
    		c: function create() {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			each_1_anchor = empty();
    		},
    		m: function mount(target, anchor) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert_dev(target, each_1_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*test, results, nextStep, prevStep, activeStep*/ 198) {
    				each_value = test;
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$1(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    						transition_in(each_blocks[i], 1);
    					} else {
    						each_blocks[i] = create_each_block$1(child_ctx);
    						each_blocks[i].c();
    						transition_in(each_blocks[i], 1);
    						each_blocks[i].m(each_1_anchor.parentNode, each_1_anchor);
    					}
    				}

    				group_outros();

    				for (i = each_value.length; i < each_blocks.length; i += 1) {
    					out(i);
    				}

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o: function outro(local) {
    			each_blocks = each_blocks.filter(Boolean);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_each(each_blocks, detaching);
    			if (detaching) detach_dev(each_1_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1.name,
    		type: "if",
    		source: "(49:41) ",
    		ctx
    	});

    	return block;
    }

    // (41:6) {#if activeStep === -1}
    function create_if_block$1(ctx) {
    	let div1;
    	let t0;
    	let div0;
    	let button;
    	let span;
    	let div1_intro;
    	let div1_outro;
    	let current;
    	let dispose;
    	const greeting = new Greeting({ $$inline: true });

    	const block = {
    		c: function create() {
    			div1 = element("div");
    			create_component(greeting.$$.fragment);
    			t0 = space();
    			div0 = element("div");
    			button = element("button");
    			span = element("span");
    			span.textContent = "Далее";
    			add_location(span, file$3, 45, 60, 1485);
    			attr_dev(button, "class", "test button");
    			add_location(button, file$3, 45, 12, 1437);
    			attr_dev(div0, "class", "test buttons");
    			add_location(div0, file$3, 44, 10, 1398);
    			attr_dev(div1, "class", "ttt svelte-1w6wo4i");
    			add_location(div1, file$3, 41, 8, 1216);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div1, anchor);
    			mount_component(greeting, div1, null);
    			append_dev(div1, t0);
    			append_dev(div1, div0);
    			append_dev(div0, button);
    			append_dev(button, span);
    			current = true;
    			dispose = listen_dev(button, "click", /*nextStep*/ ctx[6], false, false, false);
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;
    			transition_in(greeting.$$.fragment, local);

    			add_render_callback(() => {
    				if (div1_outro) div1_outro.end(1);

    				if (!div1_intro) div1_intro = create_in_transition(div1, scale, {
    					duration: 350,
    					delay: 350,
    					opacity: 0,
    					start: 0.5
    				});

    				div1_intro.start();
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(greeting.$$.fragment, local);
    			if (div1_intro) div1_intro.invalidate();
    			div1_outro = create_out_transition(div1, scale, { duration: 350, opacity: 0, start: 0.5 });
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div1);
    			destroy_component(greeting);
    			if (detaching && div1_outro) div1_outro.end();
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$1.name,
    		type: "if",
    		source: "(41:6) {#if activeStep === -1}",
    		ctx
    	});

    	return block;
    }

    // (51:14) {#if i === activeStep}
    function create_if_block_2(ctx) {
    	let div;
    	let t;
    	let div_intro;
    	let div_outro;
    	let current;

    	const question = new Question({
    			props: {
    				totalQuestions: test.length,
    				question: /*t*/ ctx[11],
    				index: /*i*/ ctx[13],
    				results: /*results*/ ctx[2]
    			},
    			$$inline: true
    		});

    	question.$on("next", /*nextStep*/ ctx[6]);
    	question.$on("prev", /*prevStep*/ ctx[7]);

    	const block = {
    		c: function create() {
    			div = element("div");
    			create_component(question.$$.fragment);
    			t = space();
    			attr_dev(div, "class", "ttt svelte-1w6wo4i");
    			add_location(div, file$3, 51, 16, 1671);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			mount_component(question, div, null);
    			append_dev(div, t);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const question_changes = {};
    			if (dirty & /*results*/ 4) question_changes.results = /*results*/ ctx[2];
    			question.$set(question_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(question.$$.fragment, local);

    			add_render_callback(() => {
    				if (div_outro) div_outro.end(1);

    				if (!div_intro) div_intro = create_in_transition(div, scale, {
    					duration: 350,
    					delay: 350,
    					opacity: 0,
    					start: 0.5
    				});

    				div_intro.start();
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(question.$$.fragment, local);
    			if (div_intro) div_intro.invalidate();
    			div_outro = create_out_transition(div, scale, { duration: 350, opacity: 0, start: 0.5 });
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_component(question);
    			if (detaching && div_outro) div_outro.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_2.name,
    		type: "if",
    		source: "(51:14) {#if i === activeStep}",
    		ctx
    	});

    	return block;
    }

    // (50:10) {#each test as t, i}
    function create_each_block$1(ctx) {
    	let if_block_anchor;
    	let current;
    	let if_block = /*i*/ ctx[13] === /*activeStep*/ ctx[1] && create_if_block_2(ctx);

    	const block = {
    		c: function create() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		m: function mount(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (/*i*/ ctx[13] === /*activeStep*/ ctx[1]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    					transition_in(if_block, 1);
    				} else {
    					if_block = create_if_block_2(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block$1.name,
    		type: "each",
    		source: "(50:10) {#each test as t, i}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$3(ctx) {
    	let div1;
    	let div0;
    	let current_block_type_index;
    	let if_block;
    	let t0;
    	let input;
    	let label;
    	let div1_class_value;
    	let current;
    	let dispose;
    	const if_block_creators = [create_if_block$1, create_if_block_1, create_else_block];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*activeStep*/ ctx[1] === -1) return 0;
    		if (/*activeStep*/ ctx[1] < test.length) return 1;
    		return 2;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	const block = {
    		c: function create() {
    			div1 = element("div");
    			div0 = element("div");
    			if_block.c();
    			t0 = space();
    			input = element("input");
    			label = element("label");
    			label.textContent = "Переключить\n  тему";
    			attr_dev(div0, "class", "test container svelte-1w6wo4i");
    			add_location(div0, file$3, 38, 2, 1148);
    			attr_dev(input, "type", "checkbox");
    			attr_dev(input, "class", "switch input");
    			attr_dev(input, "id", "switch");
    			add_location(input, file$3, 65, 2, 2329);
    			attr_dev(label, "class", "switch label");
    			attr_dev(label, "for", "switch");
    			add_location(label, file$3, 65, 80, 2407);
    			attr_dev(div1, "class", div1_class_value = "wrap " + (/*isDark*/ ctx[0] ? "violet" : "orange"));
    			set_style(div1, "background-position", /*newvalueX*/ ctx[3] + "px " + /*newvalueY*/ ctx[4] + "px");
    			add_location(div1, file$3, 37, 0, 1012);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div1, anchor);
    			append_dev(div1, div0);
    			if_blocks[current_block_type_index].m(div0, null);
    			append_dev(div1, t0);
    			append_dev(div1, input);
    			input.checked = /*isDark*/ ctx[0];
    			append_dev(div1, label);
    			current = true;

    			dispose = [
    				listen_dev(input, "change", /*input_change_handler*/ ctx[10]),
    				listen_dev(div1, "mousemove", /*onMouseMove*/ ctx[5], false, false, false)
    			];
    		},
    		p: function update(ctx, [dirty]) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				}

    				transition_in(if_block, 1);
    				if_block.m(div0, null);
    			}

    			if (dirty & /*isDark*/ 1) {
    				input.checked = /*isDark*/ ctx[0];
    			}

    			if (!current || dirty & /*isDark*/ 1 && div1_class_value !== (div1_class_value = "wrap " + (/*isDark*/ ctx[0] ? "violet" : "orange"))) {
    				attr_dev(div1, "class", div1_class_value);
    			}

    			if (!current || dirty & /*newvalueX, newvalueY*/ 24) {
    				set_style(div1, "background-position", /*newvalueX*/ ctx[3] + "px " + /*newvalueY*/ ctx[4] + "px");
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div1);
    			if_blocks[current_block_type_index].d();
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$3.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    const movementStrength = 25;

    function instance$2($$self, $$props, $$invalidate) {
    	let isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    	let activeStep = -1;
    	let results = [];
    	let newvalueX;
    	let newvalueY;
    	const height = movementStrength / window.innerHeight;
    	const width = movementStrength / window.innerWidth;

    	const onMouseMove = event => {
    		let pageX = event.pageX - window.innerWidth / 2;
    		let pageY = event.pageY - window.innerHeight / 2;
    		$$invalidate(3, newvalueX = width * pageX * -1 - 25);
    		$$invalidate(4, newvalueY = height * pageY * -1 - 50);
    	};

    	const nextStep = event => {
    		$$invalidate(1, activeStep += 1);

    		if (event.detail.group) {
    			$$invalidate(2, results = [...results, event.detail.group]);
    		}
    	};

    	const prevStep = () => {
    		$$invalidate(1, activeStep -= 1);
    		if (results.length) $$invalidate(2, results = [...results.pop()]);
    	};

    	function input_change_handler() {
    		isDark = this.checked;
    		$$invalidate(0, isDark);
    	}

    	$$self.$capture_state = () => {
    		return {};
    	};

    	$$self.$inject_state = $$props => {
    		if ("isDark" in $$props) $$invalidate(0, isDark = $$props.isDark);
    		if ("activeStep" in $$props) $$invalidate(1, activeStep = $$props.activeStep);
    		if ("results" in $$props) $$invalidate(2, results = $$props.results);
    		if ("newvalueX" in $$props) $$invalidate(3, newvalueX = $$props.newvalueX);
    		if ("newvalueY" in $$props) $$invalidate(4, newvalueY = $$props.newvalueY);
    	};

    	return [
    		isDark,
    		activeStep,
    		results,
    		newvalueX,
    		newvalueY,
    		onMouseMove,
    		nextStep,
    		prevStep,
    		height,
    		width,
    		input_change_handler
    	];
    }

    class App extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$2, create_fragment$3, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "App",
    			options,
    			id: create_fragment$3.name
    		});
    	}
    }

    const app = new App({
    	target: document.body,
    	props: {
    		name: 'world'
    	}
    });

    return app;

}());
//# sourceMappingURL=bundle.js.map

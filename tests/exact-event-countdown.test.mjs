import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('an event later in the current hour remains upcoming with its exact minutes',async()=>{
  let controller;
  class Clock extends Date { static now(){return Date.parse('2026-10-11T22:20:00Z');} }
  const context={Date:Clock,window:{DesignController:class{},EnthusiaEventDesignNext:[[[2026,9,11,22,45,30],'Soon','Description','22:45:30 UTC']],EnthusiaEventDesignMonths:[['October 2026',9,31],['November 2026',10,30]],EnthusiaDesign:{mount:Component=>{controller=new Component();}}}};
  vm.runInNewContext(await readFile(new URL('../public/assets/exact-controls/events.js',import.meta.url),'utf8'),context);
  const values=controller.renderVals();
  assert.equal(values.nextTitle,'Soon');
  assert.equal(values.nextDays,'0');
  assert.equal(values.nextHours,'0');
});

test('the countdown refreshes and advances past an expired event without a button click',async()=>{
  let controller,tick,now=Date.parse('2026-10-11T22:20:00Z');
  class Clock extends Date { static now(){return now;} }
  const context={Date:Clock,window:{DesignController:class{},setInterval:(callback,delay)=>{assert.equal(delay,60000);tick=callback;},EnthusiaEventDesignNext:[[[2026,9,11,22,45],'First','',''],[[2026,9,11,23,45],'Second','','']],EnthusiaEventDesignMonths:[['October 2026',9,31]],EnthusiaDesign:{mount:Component=>{controller=new Component();}}}};
  vm.runInNewContext(await readFile(new URL('../public/assets/exact-controls/events.js',import.meta.url),'utf8'),context);
  let values;controller.__render=()=>{values=controller.renderVals();};
  controller.componentDidMount();tick();assert.equal(values.nextTitle,'First');
  now=Date.parse('2026-10-11T22:46:00Z');tick();assert.equal(values.nextTitle,'Second');
});

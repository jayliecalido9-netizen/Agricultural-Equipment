import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import type { PrismaClient } from '@prisma/client';
import { configSchema,validateDeploymentConfig } from '../src/config.js';
import { createApp } from '../src/app.js';

const settings={JWT_SECRET:randomBytes(48).toString('hex'),NODE_ENV:'production',FRONTEND_ORIGIN:'https://equipment.example.org',COOKIE_SECURE:'true',TRUST_PROXY_HOPS:2};
test('production refuses insecure cookies, HTTP origins, paths and placeholder signing secrets',()=>{
  const valid=configSchema.parse(settings);
  assert.equal(validateDeploymentConfig(valid),valid);
  for(const changes of [{COOKIE_SECURE:'false'},{FRONTEND_ORIGIN:'http://equipment.example.org'},{FRONTEND_ORIGIN:'https://equipment.example.org/'},{FRONTEND_ORIGIN:'https://equipment.example.org/login'},{JWT_SECRET:'a'.repeat(96)},{JWT_SECRET:'replace-me-'.repeat(10)}]){
    assert.throws(()=>validateDeploymentConfig(configSchema.parse({...settings,...changes})));
  }
});
test('proxy-aware login limiting isolates clients and returns the API error contract',async()=>{
  const db={$queryRaw:async()=>[{ok:1}]} as unknown as PrismaClient;
  const app=createApp(db,configSchema.parse(settings));
  const attempt=(client:string)=>request(app).post('/api/v1/auth/login').set('X-AEAMS-Request','1').set('X-Forwarded-For',`${client}, 172.18.0.3`).send({});
  for(let i=0;i<15;i++) await attempt('198.51.100.10').expect(422);
  const limited=await attempt('198.51.100.10').expect(429);
  assert.match(limited.body.error.message,/Too many sign-in attempts/);
  assert.equal(limited.headers['cache-control'],'no-store');
  await attempt('198.51.100.11').expect(422);
  await request(app).get('/api/v1/health').expect(200);
});
test('single-proxy topology ignores forged client forwarding and oversized bodies return 413',async()=>{
  const app=createApp({} as PrismaClient,configSchema.parse({...settings,TRUST_PROXY_HOPS:1}));
  for(let i=0;i<15;i++) await request(app).post('/api/v1/auth/login').set('X-AEAMS-Request','1').set('X-Forwarded-For',`198.51.100.${i}, 172.18.0.3`).send({}).expect(422);
  await request(app).post('/api/v1/auth/login').set('X-AEAMS-Request','1').set('X-Forwarded-For','203.0.113.2, 172.18.0.3').send({}).expect(429);
  const large=await request(app).post('/api/v1/auth/login').set('X-AEAMS-Request','1').send({password:'x'.repeat(270000)}).expect(413);
  assert.match(large.body.error.message,/too large/);
});

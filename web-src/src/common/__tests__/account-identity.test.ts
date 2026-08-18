import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { AccountAvatar, accountDisplayLabel, accountInitials } from '@/common/components/AccountIdentity';

(globalThis as { React?: typeof React }).React = React;
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

test('account identity uses provider name, then email, without synthesizing a name', () => {
  assert.equal(accountDisplayLabel({ displayName: 'Ada Lovelace', email: 'ada@example.com' }), 'Ada Lovelace');
  assert.equal(accountDisplayLabel({ email: 'whole.address@example.com' }), 'whole.address@example.com');
  assert.equal(accountDisplayLabel({}), 'Anonymous');
  assert.equal(accountInitials({ displayName: 'Ada Lovelace', email: 'wrong@example.com' }), 'AL');
  assert.equal(accountInitials({ displayName: 'Prince' }), 'PR');
  assert.equal(accountInitials({ email: 'grace.hopper@example.com' }), 'GH');
  assert.equal(accountInitials({}), '');
});

test('account avatar keeps a stable decorative fallback after image failure', async () => {
  let renderer: ReactTestRenderer | undefined;
  await act(async () => {
    renderer = create(createElement(AccountAvatar, {
      account: { displayName: 'Ada Lovelace', email: 'ada@example.com', avatarUrl: '/api/account/avatar' },
    }));
  });
  const image = renderer!.root.findByType('img');
  assert.equal(image.props.alt, '');
  assert.equal(image.props.referrerPolicy, 'no-referrer');
  assert.match(image.props.className, /opacity-0/u, 'fallback stays visible until the image has loaded');
  assert.match(JSON.stringify(renderer!.toJSON()), /AL/u);
  await act(async () => image.props.onError());
  assert.equal(renderer!.root.findAllByType('img').length, 0);
  assert.match(JSON.stringify(renderer!.toJSON()), /AL/u);
  await act(async () => renderer?.unmount());
});

test('account avatar resets loading and failure state when identity changes behind the same endpoint', async () => {
  let renderer: ReactTestRenderer | undefined;
  const renderAccount = (email: string, displayName: string) => createElement(AccountAvatar, {
    account: { email, displayName, avatarUrl: '/api/account/avatar' },
  });
  await act(async () => { renderer = create(renderAccount('ada@example.com', 'Ada Lovelace')); });
  const firstImage = renderer!.root.findByType('img');
  await act(async () => firstImage.props.onLoad());
  assert.match(renderer!.root.findByType('img').props.className, /opacity-100/u);

  await act(async () => renderer!.update(renderAccount('grace@example.com', 'Grace Hopper')));
  const secondImage = renderer!.root.findByType('img');
  assert.notEqual(secondImage, firstImage, 'identity change recreates the same-URL image element');
  assert.match(secondImage.props.className, /opacity-0/u, 'the previous person’s loaded image is not retained');
  await act(async () => secondImage.props.onError());
  assert.equal(renderer!.root.findAllByType('img').length, 0);

  await act(async () => renderer!.update(renderAccount('dorothy@example.com', 'Dorothy Vaughan')));
  assert.equal(renderer!.root.findAllByType('img').length, 1, 'the next account retries the shared avatar endpoint');
  await act(async () => renderer?.unmount());
});

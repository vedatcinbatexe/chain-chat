import { ApiError } from '../client';
import { describeError, describeSendFailure, errorCode, isBanned } from '../errors';

class ChatRejectedError extends Error {
  constructor(readonly code: string) {
    super(`The server rejected the message (${code}).`);
    this.name = 'ChatRejectedError';
  }
}

describe('describeError', () => {
  it('explains admin refusals from the API', () => {
    const error = new ApiError(403, { title: 'Group request failed', detail: 'GroupCreationDisabled' });
    expect(errorCode(error)).toBe('GroupCreationDisabled');
    expect(describeError(error)).toBe('Creating new groups is turned off by an administrator.');
  });

  it('explains admin refusals of a chat message', () => {
    expect(describeSendFailure(new ChatRejectedError('MessagingPaused'))).toBe('Messaging is paused by an administrator. Try again later.');
    expect(isBanned(new ChatRejectedError('Banned'))).toBe(true);
  });

  it('does not show unknown server codes to the user', () => {
    expect(describeError(new ChatRejectedError('SeqGap'))).toBe('Something went wrong. Please try again.');
    expect(describeSendFailure(new ChatRejectedError('SeqGap'))).toBeNull();
    expect(describeError(new ApiError(500, { title: 'An unexpected error occurred' }), 'Could not load.')).toBe('Could not load.');
  });

  it('keeps the message of local errors', () => {
    expect(describeError(new Error('Not connected to the chat server.'))).toBe('Not connected to the chat server.');
    expect(isBanned(new Error('Banned'))).toBe(false);
  });
});

// Manual mock for googleapis
const mockList = jest.fn()
const mockGet = jest.fn()
const mockCreate = jest.fn()
const mockUpdate = jest.fn()

export const mockDriveFiles = {
  list: mockList,
  get: mockGet,
  create: mockCreate,
  update: mockUpdate,
}

export const google = {
  auth: {
    OAuth2: jest.fn(() => ({
      setCredentials: jest.fn(),
      getAccessToken: jest.fn(),
    })),
  },
  drive: jest.fn(() => ({
    files: mockDriveFiles,
  })),
}

// Export the individual mock functions for easier access
export { mockList, mockGet, mockCreate, mockUpdate } 
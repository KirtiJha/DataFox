import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { 
  XMarkIcon, 
  PlusIcon, 
  PencilIcon, 
  TrashIcon,
  BookmarkIcon,
  EyeIcon,
  EyeSlashIcon,
  WifiIcon
} from '@heroicons/react/24/outline'

const BookmarkModal = ({ onClose, bookmarks, onBookmarksUpdate, onConnect }) => {
  const [editingId, setEditingId] = useState(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [showPasswords, setShowPasswords] = useState({})
  const [formData, setFormData] = useState({
    name: '',
    host: '',
    port: 21,
    username: '',
    password: '',
    type: 'ftp',
    secure: false
  })

  const resetForm = () => {
    setFormData({
      name: '',
      host: '',
      port: 21,
      username: '',
      password: '',
      type: 'ftp',
      secure: false
    })
    setEditingId(null)
    setShowAddForm(false)
  }

  const handleEdit = (bookmark) => {
    setFormData(bookmark)
    setEditingId(bookmark.id)
    setShowAddForm(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!formData.name || !formData.host || !formData.username) {
      toast.error('Please fill in all required fields')
      return
    }

    try {
      if (typeof window !== 'undefined' && window.electronAPI) {
        if (editingId) {
          await window.electronAPI.bookmarksUpdate(editingId, formData)
          toast.success('Bookmark updated')
        } else {
          await window.electronAPI.bookmarksAdd(formData)
          toast.success('Bookmark added')
        }
        
        await onBookmarksUpdate()
        resetForm()
      }
    } catch (error) {
      toast.error(`Failed to save bookmark: ${error.message}`)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this bookmark?')) {
      return
    }

    try {
      if (typeof window !== 'undefined' && window.electronAPI) {
        await window.electronAPI.bookmarksDelete(id)
        await onBookmarksUpdate()
        toast.success('Bookmark deleted')
      }
    } catch (error) {
      toast.error(`Failed to delete bookmark: ${error.message}`)
    }
  }

  const togglePasswordVisibility = (id) => {
    setShowPasswords(prev => ({
      ...prev,
      [id]: !prev[id]
    }))
  }

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <BookmarkIcon className="w-5 h-5" />
            Manage Bookmarks
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAddForm(true)}
              className="btn btn-primary btn-sm flex items-center gap-2"
            >
              <PlusIcon className="w-4 h-4" />
              Add New
            </button>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Bookmarks List */}
          <div className="flex-1 p-6 overflow-y-auto">
            <div className="space-y-3">
              {bookmarks.length === 0 ? (
                <div className="text-center py-12">
                  <BookmarkIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500 dark:text-gray-400">
                    No bookmarks yet. Add your first bookmark to get started.
                  </p>
                </div>
              ) : (
                bookmarks.map((bookmark) => (
                  <motion.div
                    key={bookmark.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="card p-4"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-medium text-gray-900 dark:text-white">
                          {bookmark.name}
                        </h3>
                        <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                          <div>{bookmark.username}@{bookmark.host}:{bookmark.port}</div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="px-2 py-1 bg-primary-100 dark:bg-primary-900 text-primary-800 dark:text-primary-200 text-xs rounded">
                              {(bookmark.type || bookmark.protocol)?.toUpperCase() || (bookmark.host?.includes('cloud-object-storage') || bookmark.host?.includes('s3') ? 'S3' : 'FTP')}
                            </span>
                            {bookmark.secure && (
                              <span className="px-2 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 text-xs rounded">
                                Secure
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <div className="flex items-center">
                            <input
                              type={showPasswords[bookmark.id] ? 'text' : 'password'}
                              value={showPasswords[bookmark.id] ? bookmark.password : "••••••••"}
                              readOnly
                              className="text-sm bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded w-20"
                            />
                            <button
                              onClick={() => togglePasswordVisibility(bookmark.id)}
                              className="ml-1 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                            >
                              {showPasswords[bookmark.id] ? (
                                <EyeSlashIcon className="w-4 h-4 text-gray-400" />
                              ) : (
                                <EyeIcon className="w-4 h-4 text-gray-400" />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <button
                          onClick={() => onConnect && onConnect(bookmark)}
                          className="p-2 hover:bg-blue-100 dark:hover:bg-blue-900 rounded-lg transition-colors"
                          title="Connect"
                        >
                          <WifiIcon className="w-4 h-4 text-blue-500" />
                        </button>
                        <button
                          onClick={() => handleEdit(bookmark)}
                          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <PencilIcon className="w-4 h-4 text-gray-500" />
                        </button>
                        <button
                          onClick={() => handleDelete(bookmark.id)}
                          className="p-2 hover:bg-red-100 dark:hover:bg-red-900 rounded-lg transition-colors"
                          title="Delete"
                        >
                          <TrashIcon className="w-4 h-4 text-red-500" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </div>

          {/* Add/Edit Form */}
          <AnimatePresence>
            {showAddForm && (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: '400px', opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                className="bg-gray-50 dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 overflow-hidden"
              >
                <div className="p-6 h-full overflow-y-auto">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                      {editingId ? 'Edit Bookmark' : 'Add Bookmark'}
                    </h3>
                    <button
                      onClick={resetForm}
                      className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                    >
                      <XMarkIcon className="w-4 h-4" />
                    </button>
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Name *
                      </label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => handleInputChange('name', e.target.value)}
                        placeholder="My FTP Server"
                        className="input-field"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Protocol
                      </label>
                      <select
                        value={formData.type}
                        onChange={(e) => handleInputChange('type', e.target.value)}
                        className="input-field"
                      >
                        <option value="ftp">FTP</option>
                        <option value="ftps">FTPS (Explicit)</option>
                        <option value="sftp">SFTP</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Host *
                      </label>
                      <input
                        type="text"
                        value={formData.host}
                        onChange={(e) => handleInputChange('host', e.target.value)}
                        placeholder="ftp.example.com"
                        className="input-field"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Port
                      </label>
                      <input
                        type="number"
                        value={formData.port}
                        onChange={(e) => handleInputChange('port', parseInt(e.target.value) || 21)}
                        className="input-field"
                        min="1"
                        max="65535"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Username *
                      </label>
                      <input
                        type="text"
                        value={formData.username}
                        onChange={(e) => handleInputChange('username', e.target.value)}
                        placeholder="username"
                        className="input-field"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Password
                      </label>
                      <input
                        type="password"
                        value={formData.password}
                        onChange={(e) => handleInputChange('password', e.target.value)}
                        placeholder="password"
                        className="input-field"
                      />
                    </div>

                    <div className="pt-4 space-y-3">
                      <button
                        type="submit"
                        className="w-full btn btn-primary"
                      >
                        {editingId ? 'Update Bookmark' : 'Add Bookmark'}
                      </button>
                      <button
                        type="button"
                        onClick={resetForm}
                        className="w-full btn btn-secondary"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  )
}

export default BookmarkModal

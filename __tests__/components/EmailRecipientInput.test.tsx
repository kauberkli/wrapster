import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { EmailRecipientInput } from '@/components/EmailRecipientInput'

describe('EmailRecipientInput', () => {
  describe('rendering', () => {
    it('should render with default placeholder', () => {
      render(<EmailRecipientInput recipients={[]} onChange={() => {}} />)

      expect(
        screen.getByPlaceholderText('Enter email and press Enter')
      ).toBeInTheDocument()
    })

    it('should render with custom placeholder', () => {
      render(
        <EmailRecipientInput
          recipients={[]}
          onChange={() => {}}
          placeholder="Add recipient email"
        />
      )

      expect(screen.getByPlaceholderText('Add recipient email')).toBeInTheDocument()
    })

    it('should render existing recipients as chips', () => {
      render(
        <EmailRecipientInput
          recipients={['user1@example.com', 'user2@example.com']}
          onChange={() => {}}
        />
      )

      expect(screen.getByText('user1@example.com')).toBeInTheDocument()
      expect(screen.getByText('user2@example.com')).toBeInTheDocument()
    })

    it('should hide placeholder when recipients exist', () => {
      render(
        <EmailRecipientInput
          recipients={['user@example.com']}
          onChange={() => {}}
          placeholder="Enter email"
        />
      )

      // Placeholder should be empty when there are recipients
      const input = screen.getByRole('textbox')
      expect(input).not.toHaveAttribute('placeholder', 'Enter email')
    })

    it('should apply custom className', () => {
      const { container } = render(
        <EmailRecipientInput
          recipients={[]}
          onChange={() => {}}
          className="custom-class"
        />
      )

      expect(container.firstChild).toHaveClass('custom-class')
    })
  })

  describe('adding recipients', () => {
    it('should add valid email on Enter', async () => {
      const onChange = vi.fn()
      const user = userEvent.setup()

      render(<EmailRecipientInput recipients={[]} onChange={onChange} />)

      const input = screen.getByRole('textbox')
      await user.type(input, 'test@example.com')
      await user.keyboard('{Enter}')

      expect(onChange).toHaveBeenCalledWith(['test@example.com'])
    })

    it('should trim whitespace from email', async () => {
      const onChange = vi.fn()
      const user = userEvent.setup()

      render(<EmailRecipientInput recipients={[]} onChange={onChange} />)

      const input = screen.getByRole('textbox')
      await user.type(input, '  test@example.com  ')
      await user.keyboard('{Enter}')

      expect(onChange).toHaveBeenCalledWith(['test@example.com'])
    })

    it('should convert email to lowercase', async () => {
      const onChange = vi.fn()
      const user = userEvent.setup()

      render(<EmailRecipientInput recipients={[]} onChange={onChange} />)

      const input = screen.getByRole('textbox')
      await user.type(input, 'TEST@EXAMPLE.COM')
      await user.keyboard('{Enter}')

      expect(onChange).toHaveBeenCalledWith(['test@example.com'])
    })

    it('should clear input after adding email', async () => {
      const onChange = vi.fn()
      const user = userEvent.setup()

      render(<EmailRecipientInput recipients={[]} onChange={onChange} />)

      const input = screen.getByRole('textbox')
      await user.type(input, 'test@example.com')
      await user.keyboard('{Enter}')

      expect(input).toHaveValue('')
    })

    it('should append to existing recipients', async () => {
      const onChange = vi.fn()
      const user = userEvent.setup()

      render(
        <EmailRecipientInput
          recipients={['existing@example.com']}
          onChange={onChange}
        />
      )

      const input = screen.getByRole('textbox')
      await user.type(input, 'new@example.com')
      await user.keyboard('{Enter}')

      expect(onChange).toHaveBeenCalledWith([
        'existing@example.com',
        'new@example.com',
      ])
    })
  })

  describe('validation', () => {
    it('should show error for invalid email format', async () => {
      const onChange = vi.fn()
      const user = userEvent.setup()

      render(<EmailRecipientInput recipients={[]} onChange={onChange} />)

      const input = screen.getByRole('textbox')
      await user.type(input, 'invalid-email')
      await user.keyboard('{Enter}')

      expect(screen.getByText('Invalid email format')).toBeInTheDocument()
      expect(onChange).not.toHaveBeenCalled()
    })

    it('should show error for duplicate email', async () => {
      const onChange = vi.fn()
      const user = userEvent.setup()

      render(
        <EmailRecipientInput
          recipients={['existing@example.com']}
          onChange={onChange}
        />
      )

      const input = screen.getByRole('textbox')
      await user.type(input, 'existing@example.com')
      await user.keyboard('{Enter}')

      expect(screen.getByText('Email already added')).toBeInTheDocument()
      expect(onChange).not.toHaveBeenCalled()
    })

    it('should not add empty email', async () => {
      const onChange = vi.fn()
      const user = userEvent.setup()

      render(<EmailRecipientInput recipients={[]} onChange={onChange} />)

      screen.getByRole('textbox')
      await user.keyboard('{Enter}')

      expect(onChange).not.toHaveBeenCalled()
    })

    it('should not add whitespace-only email', async () => {
      const onChange = vi.fn()
      const user = userEvent.setup()

      render(<EmailRecipientInput recipients={[]} onChange={onChange} />)

      const input = screen.getByRole('textbox')
      await user.type(input, '   ')
      await user.keyboard('{Enter}')

      expect(onChange).not.toHaveBeenCalled()
    })

    it('should clear error on input change', async () => {
      const onChange = vi.fn()
      const user = userEvent.setup()

      render(<EmailRecipientInput recipients={[]} onChange={onChange} />)

      const input = screen.getByRole('textbox')
      await user.type(input, 'invalid')
      await user.keyboard('{Enter}')

      expect(screen.getByText('Invalid email format')).toBeInTheDocument()

      await user.type(input, 'a')

      expect(screen.queryByText('Invalid email format')).not.toBeInTheDocument()
    })

    it('should validate complex email formats', async () => {
      const onChange = vi.fn()
      const user = userEvent.setup()

      render(<EmailRecipientInput recipients={[]} onChange={onChange} />)

      const input = screen.getByRole('textbox')

      // Valid complex email
      await user.type(input, 'user+tag@sub.example.com')
      await user.keyboard('{Enter}')
      expect(onChange).toHaveBeenCalledWith(['user+tag@sub.example.com'])

      onChange.mockClear()
      await user.clear(input)

      // Invalid - no domain
      await user.type(input, 'user@')
      await user.keyboard('{Enter}')
      expect(screen.getByText('Invalid email format')).toBeInTheDocument()
    })
  })

  describe('removing recipients', () => {
    it('should remove recipient on X button click', async () => {
      const onChange = vi.fn()
      const user = userEvent.setup()

      render(
        <EmailRecipientInput
          recipients={['user1@example.com', 'user2@example.com']}
          onChange={onChange}
        />
      )

      // Find the remove button for user1
      const removeButtons = screen.getAllByRole('button')
      await user.click(removeButtons[0])

      expect(onChange).toHaveBeenCalledWith(['user2@example.com'])
    })

    it('should remove last recipient on backspace with empty input', async () => {
      const onChange = vi.fn()
      const user = userEvent.setup()

      render(
        <EmailRecipientInput
          recipients={['user1@example.com', 'user2@example.com']}
          onChange={onChange}
        />
      )

      const input = screen.getByRole('textbox')
      await user.click(input)
      await user.keyboard('{Backspace}')

      expect(onChange).toHaveBeenCalledWith(['user1@example.com'])
    })

    it('should not remove recipient on backspace when input has text', async () => {
      const onChange = vi.fn()
      const user = userEvent.setup()

      render(
        <EmailRecipientInput
          recipients={['user@example.com']}
          onChange={onChange}
        />
      )

      const input = screen.getByRole('textbox')
      await user.type(input, 'some text')
      await user.keyboard('{Backspace}')

      expect(onChange).not.toHaveBeenCalled()
    })
  })

  describe('disabled state', () => {
    it('should disable input when disabled prop is true', () => {
      render(
        <EmailRecipientInput recipients={[]} onChange={() => {}} disabled />
      )

      expect(screen.getByRole('textbox')).toBeDisabled()
    })

    it('should not show remove buttons when disabled', () => {
      render(
        <EmailRecipientInput
          recipients={['user@example.com']}
          onChange={() => {}}
          disabled
        />
      )

      expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })

    it('should apply disabled styling to container', () => {
      const { container } = render(
        <EmailRecipientInput recipients={[]} onChange={() => {}} disabled />
      )

      expect(container.querySelector('.opacity-50')).toBeInTheDocument()
    })
  })

  describe('container click behavior', () => {
    it('should focus input on container click', async () => {
      const user = userEvent.setup()

      const { container } = render(
        <EmailRecipientInput recipients={[]} onChange={() => {}} />
      )

      const wrapper = container.querySelector('.cursor-text')
      if (wrapper) {
        await user.click(wrapper)
      }

      expect(screen.getByRole('textbox')).toHaveFocus()
    })
  })
})

describe('EmailRecipientInput edge cases', () => {
  it('should handle many recipients', () => {
    const manyRecipients = Array.from(
      { length: 20 },
      (_, i) => `user${i}@example.com`
    )

    render(
      <EmailRecipientInput recipients={manyRecipients} onChange={() => {}} />
    )

    expect(screen.getByText('user0@example.com')).toBeInTheDocument()
    expect(screen.getByText('user19@example.com')).toBeInTheDocument()
  })

  it('should handle very long email addresses', () => {
    const longEmail = 'a'.repeat(50) + '@' + 'b'.repeat(50) + '.com'

    render(
      <EmailRecipientInput recipients={[longEmail]} onChange={() => {}} />
    )

    expect(screen.getByText(longEmail)).toBeInTheDocument()
  })

  it('should handle international domain emails', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(<EmailRecipientInput recipients={[]} onChange={onChange} />)

    const input = screen.getByRole('textbox')
    await user.type(input, 'user@例え.jp')
    await user.keyboard('{Enter}')

    expect(onChange).toHaveBeenCalledWith(['user@例え.jp'])
  })

  it('should prevent Enter key from submitting form', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()

    render(
      <form onSubmit={onSubmit}>
        <EmailRecipientInput recipients={[]} onChange={() => {}} />
      </form>
    )

    const input = screen.getByRole('textbox')
    await user.type(input, 'test@example.com')
    await user.keyboard('{Enter}')

    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('should handle rapid additions', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(<EmailRecipientInput recipients={[]} onChange={onChange} />)

    const input = screen.getByRole('textbox')

    // Rapid additions
    for (let i = 0; i < 5; i++) {
      await user.type(input, `user${i}@example.com`)
      await user.keyboard('{Enter}')
    }

    expect(onChange).toHaveBeenCalledTimes(5)
  })

  it('should stop propagation when removing recipient', async () => {
    const onContainerClick = vi.fn()
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(
      <div onClick={onContainerClick}>
        <EmailRecipientInput
          recipients={['user@example.com']}
          onChange={onChange}
        />
      </div>
    )

    const removeButton = screen.getByRole('button')
    await user.click(removeButton)

    // Container click should not be triggered
    expect(onContainerClick).not.toHaveBeenCalled()
  })

  it('should show border error style when invalid', async () => {
    const user = userEvent.setup()

    const { container } = render(
      <EmailRecipientInput recipients={[]} onChange={() => {}} />
    )

    const input = screen.getByRole('textbox')
    await user.type(input, 'invalid')
    await user.keyboard('{Enter}')

    expect(container.querySelector('.border-destructive')).toBeInTheDocument()
  })
})
